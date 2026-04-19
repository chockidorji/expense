import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";
import { readStashed, deleteStashed } from "@/lib/upload-store";
import { normalizeMerchant, insertOrLog } from "@/lib/dedup";
import { categorizeByKeywords } from "@/lib/categorizer";
import { TxnSource, TxnType } from "@prisma/client";
import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const BodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  mapping: z.object({
    date: z.string().min(1),
    merchant: z.string().min(1),
    // Single-column mode
    amount: z.string().optional(),
    type: z.string().optional(),
    // Two-column mode (HDFC/most banks use separate Withdrawal & Deposit columns)
    withdrawalAmount: z.string().optional(),
    depositAmount: z.string().optional(),
    account: z.string().optional(),
  }).refine(
    m => !!m.amount || !!m.withdrawalAmount || !!m.depositAmount,
    { message: "Map either 'amount' (single column) or at least one of 'withdrawalAmount' / 'depositAmount' (two-column mode)" },
  ),
  defaultType: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
});

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
function parseType(raw: string | undefined, fallback: TxnType): TxnType {
  if (!raw) return fallback;
  const r = raw.toLowerCase();
  if (r.includes("cr") || r.includes("credit") || r.includes("+")) return TxnType.CREDIT;
  if (r.includes("dr") || r.includes("debit") || r.includes("-")) return TxnType.DEBIT;
  return fallback;
}

/**
 * Given a row, resolve (amount, type) based on which mapping mode is active.
 * Returns null if the row has no usable amount — caller should record an error.
 */
function resolveAmountAndType(
  row: Record<string, string>,
  mapping: z.infer<typeof BodySchema>["mapping"],
  defaultType: TxnType,
): { amount: number; type: TxnType } | null {
  // Two-column mode — check withdrawal first, then deposit.
  if (mapping.withdrawalAmount || mapping.depositAmount) {
    const w = mapping.withdrawalAmount ? parseAmount(row[mapping.withdrawalAmount]) : null;
    const d = mapping.depositAmount ? parseAmount(row[mapping.depositAmount]) : null;
    if (w && w > 0) return { amount: w, type: TxnType.DEBIT };
    if (d && d > 0) return { amount: d, type: TxnType.CREDIT };
    return null;
  }
  // Single-column mode
  if (mapping.amount) {
    const amt = parseAmount(row[mapping.amount]);
    if (!amt) return null;
    const type = parseType(mapping.type ? row[mapping.type] : undefined, defaultType);
    return { amount: amt, type };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = BodySchema.parse(await req.json());
    const buf = await readStashed(body.token);
    const parsed = Papa.parse<Record<string, string>>(buf.toString("utf8"), { header: true, skipEmptyLines: true });
    const errors: { row: number; reason: string }[] = [];
    let inserted = 0, duplicates = 0;

    const overrideRows = await forUser(userId).categoryOverride.findMany({});
    const overrideMap = new Map(overrideRows.map(o => [o.merchantNormalized, o.category]));

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rawDate = row[body.mapping.date];
      const rawMerchant = row[body.mapping.merchant];
      const txDate = rawDate ? parseCsvDate(rawDate) : null;
      const amtType = resolveAmountAndType(row, body.mapping, body.defaultType);
      if (!amtType || !txDate || !rawMerchant) {
        errors.push({
          row: i + 2,
          reason: `Unparseable: date=${rawDate ?? "-"}, merchant=${rawMerchant ?? "-"}, amount=${amtType ? amtType.amount : "none"}`,
        });
        continue;
      }
      const merchantNormalized = normalizeMerchant(rawMerchant);
      const category = overrideMap.get(merchantNormalized) ?? categorizeByKeywords(merchantNormalized);
      const out = await insertOrLog(userId, {
        amount: amtType.amount,
        transactionDate: txDate,
        merchant: rawMerchant,
        merchantNormalized,
        category,
        type: amtType.type,
        source: TxnSource.CSV,
        bankAccount: body.mapping.account ? row[body.mapping.account] ?? null : null,
        referenceNumber: null,
      });
      if (out.status === "inserted") inserted++;
      else duplicates++;
    }

    await deleteStashed(body.token);
    return NextResponse.json({ inserted, duplicates, errors });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
