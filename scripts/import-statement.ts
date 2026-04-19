/* eslint-disable no-console */
// One-off bank-statement importer. Reuses the same parsing logic as the
// /api/upload/csv/{preview,import} endpoints but skips the HTTP layer so it
// can run offline against a local .xls/.xlsx/.csv.
//
// Usage:
//   pnpm tsx --env-file=.env.local --env-file=.env scripts/import-statement.ts <file> \
//     [--user <userId>] [--skip <N>] \
//     [--date "Date"] [--merchant "Narration"] \
//     [--withdrawal "Withdrawal Amt."] [--deposit "Deposit Amt."] \
//     [--amount "Amount"] [--type "Dr/Cr"] [--default-type DEBIT|CREDIT] \
//     [--account "Chq./Ref.No."]
//
// If the column flags are omitted the script auto-picks the most-likely HDFC
// column names.

import { promises as fs } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { prisma, forUser } from "../lib/db";
import { normalizeMerchant, insertOrLog } from "../lib/dedup";
import { categorizeByKeywords } from "../lib/categorizer";
import { TxnSource, TxnType } from "@prisma/client";

type Args = {
  file: string;
  userId?: string;
  skip?: number;
  date?: string;
  merchant?: string;
  withdrawal?: string;
  deposit?: string;
  amount?: string;
  type?: string;
  account?: string;
  defaultType: TxnType;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { file: "", defaultType: TxnType.DEBIT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--") && !out.file) { out.file = a; continue; }
    const next = argv[i + 1];
    switch (a) {
      case "--user":        out.userId = next; i++; break;
      case "--skip":        out.skip = Number(next); i++; break;
      case "--date":        out.date = next; i++; break;
      case "--merchant":    out.merchant = next; i++; break;
      case "--withdrawal":  out.withdrawal = next; i++; break;
      case "--deposit":     out.deposit = next; i++; break;
      case "--amount":      out.amount = next; i++; break;
      case "--type":        out.type = next; i++; break;
      case "--account":     out.account = next; i++; break;
      case "--default-type":out.defaultType = next === "CREDIT" ? TxnType.CREDIT : TxnType.DEBIT; i++; break;
    }
  }
  if (!out.file) {
    console.error("Usage: pnpm tsx scripts/import-statement.ts <file> [--user id] [--skip N] [--date ...] [--merchant ...] [--withdrawal ...] [--deposit ...]");
    process.exit(2);
  }
  return out;
}

function isExcel(fileName: string): boolean {
  const n = fileName.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm");
}

function excelBufferToCsv(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer", raw: false });
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim().length > 0) return csv;
  }
  return "";
}

const HEADER_HINTS = [
  "date", "narration", "description", "particulars", "transaction",
  "amount", "debit", "credit", "withdrawal", "deposit", "value",
  "balance", "ref", "reference", "chq", "cheque",
];

function detectHeaderRow(allRows: string[][]): number {
  const limit = Math.min(allRows.length, 30);
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const row = allRows[i] ?? [];
    const nonEmpty = row.filter(c => (c ?? "").trim().length > 0).length;
    if (nonEmpty < 4) continue;
    const joined = row.join(" ").toLowerCase();
    const hits = HEADER_HINTS.filter(h => joined.includes(h)).length;
    if (hits >= 2 && hits > bestScore) {
      bestScore = hits;
      bestIdx = i;
    }
  }
  return bestIdx;
}

const DATE_FORMATS = ["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "dd MMM yyyy", "dd/MM/yy", "dd-MM-yy"];

function parseAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,]/g, "").replace(/Rs\.?/i, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "0" || cleaned === "0.00") return null;
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Math.abs(parseFloat(m[1]));
  return n > 0 ? n : null;
}

function parseCsvDate(raw: string): Date | null {
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(raw.trim(), fmt, new Date(2000, 0, 1));
    if (isValid(d)) {
      d.setHours(0, 0, 0, 0);
      return fromZonedTime(d, "Asia/Kolkata");
    }
  }
  return null;
}

function pickHeader(headers: string[], hints: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase());
  for (const hint of hints) {
    const idx = lower.findIndex(h => h.includes(hint));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const user = args.userId
    ? await prisma.user.findUnique({ where: { id: args.userId } })
    : await prisma.user.findFirst();
  if (!user) throw new Error("No user found. Pass --user <id> or ensure at least one user is signed in.");

  const absPath = path.resolve(args.file);
  console.log(`[import] file=${absPath} user=${user.email}`);
  const buf = await fs.readFile(absPath);
  const csvText = isExcel(absPath) ? excelBufferToCsv(buf) : buf.toString("utf8");
  if (!csvText.trim()) throw new Error("File produced no CSV text");

  const raw = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const allRows = (raw.data as string[][]).filter(Array.isArray);
  const skipRows = args.skip ?? detectHeaderRow(allRows);
  console.log(`[import] totalRows=${allRows.length} skipRows=${skipRows}`);

  const trimmed = allRows.slice(skipRows);
  const trimmedCsv = Papa.unparse(trimmed, { newline: "\n" });
  const parsed = Papa.parse<Record<string, string>>(trimmedCsv, { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  console.log(`[import] headers: ${headers.map(h => `"${h}"`).join(", ")}`);
  console.log(`[import] dataRows=${parsed.data.length}`);

  // Auto-pick HDFC-style columns if not supplied.
  const dateCol = args.date ?? pickHeader(headers, ["date"]);
  const merchantCol = args.merchant ?? pickHeader(headers, ["narration", "description", "particulars"]);
  const withdrawalCol = args.withdrawal ?? pickHeader(headers, ["withdrawal", "debit"]);
  const depositCol = args.deposit ?? pickHeader(headers, ["deposit", "credit"]);
  const accountCol = args.account ?? pickHeader(headers, ["chq", "ref"]);
  const amountCol = args.amount;
  const typeCol = args.type;

  console.log(`[import] mapped: date=${dateCol} merchant=${merchantCol} withdrawal=${withdrawalCol} deposit=${depositCol} account=${accountCol}`);

  if (!dateCol || !merchantCol) throw new Error("Failed to auto-detect date/merchant columns. Pass --date/--merchant explicitly.");
  if (!amountCol && !withdrawalCol && !depositCol) throw new Error("No amount columns detected. Pass --amount or --withdrawal/--deposit.");

  const overrideRows = await forUser(user.id).categoryOverride.findMany({});
  const overrideMap = new Map(overrideRows.map(o => [o.merchantNormalized, o.category]));

  let inserted = 0, duplicates = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rawDate = dateCol ? row[dateCol] : undefined;
    const rawMerchant = merchantCol ? row[merchantCol] : undefined;
    const txDate = rawDate ? parseCsvDate(rawDate) : null;

    let amount: number | null = null;
    let type: TxnType = args.defaultType;
    if (withdrawalCol || depositCol) {
      const w = withdrawalCol ? parseAmount(row[withdrawalCol]) : null;
      const d = depositCol ? parseAmount(row[depositCol]) : null;
      if (w && w > 0) { amount = w; type = TxnType.DEBIT; }
      else if (d && d > 0) { amount = d; type = TxnType.CREDIT; }
    } else if (amountCol) {
      amount = parseAmount(row[amountCol]);
      const rawType = typeCol ? row[typeCol] : undefined;
      if (rawType) {
        const r = rawType.toLowerCase();
        if (r.includes("cr") || r.includes("credit") || r.includes("+")) type = TxnType.CREDIT;
        else if (r.includes("dr") || r.includes("debit") || r.includes("-")) type = TxnType.DEBIT;
      }
    }

    if (!amount || !txDate || !rawMerchant) {
      errors.push({ row: i + 2 + skipRows, reason: `date=${rawDate ?? "-"} merchant=${rawMerchant ?? "-"} amount=${amount ?? "none"}` });
      continue;
    }

    const merchantNormalized = normalizeMerchant(rawMerchant);
    const category = overrideMap.get(merchantNormalized) ?? categorizeByKeywords(merchantNormalized);
    const out = await insertOrLog(user.id, {
      amount,
      transactionDate: txDate,
      merchant: rawMerchant,
      merchantNormalized,
      category,
      type,
      source: TxnSource.CSV,
      bankAccount: accountCol ? (row[accountCol] ?? null) : null,
      referenceNumber: null,
    });
    if (out.status === "inserted") inserted++; else duplicates++;
  }

  console.log(`\n[import] RESULT inserted=${inserted} duplicates=${duplicates} errors=${errors.length}`);
  if (errors.length > 0) {
    console.log("\n[import] first 5 error rows:");
    errors.slice(0, 5).forEach(e => console.log(`  row ${e.row}: ${e.reason}`));
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
