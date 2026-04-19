import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/session";
import { stashCsv } from "@/lib/upload-store";

function isExcel(fileName: string, mimeType: string): boolean {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) return true;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return true;
  return false;
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

/**
 * Given the detected header list, suggest which column maps to each role so
 * the UI can pre-fill the dropdowns. Looks for common Indian-bank header
 * phrasings (HDFC, SBI, ICICI, Axis, Kotak all use similar words).
 */
type SuggestedMapping = {
  date: string | null;
  merchant: string | null;
  amount: string | null;
  withdrawalAmount: string | null;
  depositAmount: string | null;
  type: string | null;
  account: string | null;
  recommendedMode: "single" | "dual";
};

function suggestMapping(headers: string[]): SuggestedMapping {
  const lower = headers.map(h => h.toLowerCase().trim());
  const find = (...patterns: (string | RegExp)[]): string | null => {
    for (const p of patterns) {
      const idx = lower.findIndex(h => (typeof p === "string" ? h.includes(p) : p.test(h)));
      if (idx !== -1) return headers[idx];
    }
    return null;
  };

  // Date — "date" but NOT "value dt" / "value date" (those are cleared-on dates, secondary)
  const date = (() => {
    for (let i = 0; i < lower.length; i++) {
      if (/value/.test(lower[i])) continue;
      if (/\bdate\b|\btxn date\b|transaction date/.test(lower[i])) return headers[i];
    }
    return find("date");
  })();

  // Merchant / narration / description / particulars
  const merchant = find("narration", "description", "particulars", "remarks", /^details?$/);

  // Two-column amount
  const withdrawalAmount = find("withdrawal", /\bdebit\b.*(amt|amount)/, /^debit/, "dr amount", "amount withdrawn");
  const depositAmount = find("deposit", /\bcredit\b.*(amt|amount)/, /^credit/, "cr amount", "amount deposited");

  // Single-column amount fallback
  const amount = find(/^amount$/, /transaction.*amount/, /amount.*\(inr\)/, "inr");

  // Type column (Dr/Cr)
  const type = find("dr/cr", "cr/dr", /debit\s*\/\s*credit/, "txn type", /^type$/);

  // Account / cheque / reference
  const account = find("chq", "cheque", /^ref\b/, "reference");

  // Prefer dual mode when both withdrawal+deposit found; else single if amount found.
  const recommendedMode: "single" | "dual" = withdrawalAmount || depositAmount ? "dual" : "single";

  return { date, merchant, amount, withdrawalAmount, depositAmount, type, account, recommendedMode };
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

    const skipParam = Number(form.get("skipRows") ?? NaN);
    const userSkip = Number.isFinite(skipParam) && skipParam >= 0 ? Math.floor(skipParam) : null;

    const buf = Buffer.from(await file.arrayBuffer());
    const csvText = isExcel(file.name, file.type) ? excelBufferToCsv(buf) : buf.toString("utf8");
    if (!csvText.trim()) {
      return NextResponse.json({ error: "File is empty or has no usable sheet" }, { status: 400 });
    }

    const raw = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
    const allRows = (raw.data as string[][]).filter(Array.isArray);
    if (allRows.length === 0) {
      return NextResponse.json({ error: "Spreadsheet has no rows" }, { status: 400 });
    }

    const detectedSkip = detectHeaderRow(allRows);
    const skipRows = userSkip ?? detectedSkip;

    if (skipRows >= allRows.length) {
      return NextResponse.json({ error: `skipRows (${skipRows}) is past the end of the file` }, { status: 400 });
    }

    const trimmedRows = allRows.slice(skipRows);
    const trimmedCsv = Papa.unparse(trimmedRows, { newline: "\n" });

    const result = Papa.parse<Record<string, string>>(trimmedCsv, { header: true, skipEmptyLines: true });
    if (result.errors.length > 0 && result.data.length === 0) {
      return NextResponse.json({ error: "Unable to parse spreadsheet after skipping banner rows", details: result.errors.slice(0, 3) }, { status: 400 });
    }
    const headers = result.meta.fields ?? [];
    const suggestedMapping = suggestMapping(headers);

    const token = await stashCsv(Buffer.from(trimmedCsv, "utf8"));
    return NextResponse.json({
      token,
      headers,
      sampleRows: result.data.slice(0, 5),
      rowCount: result.data.length,
      skipRows,
      detectedSkip,
      totalRowsBeforeSkip: allRows.length,
      suggestedMapping,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
