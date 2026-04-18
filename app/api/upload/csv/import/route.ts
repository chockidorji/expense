import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { readStashed, deleteStashed } from "@/lib/upload-store";
import { normalizeMerchant, insertOrLog } from "@/lib/dedup";
import { categorize } from "@/lib/categorizer";
import { TxnSource, TxnType } from "@prisma/client";
import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const BodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  mapping: z.object({
    date: z.string().min(1),
    amount: z.string().min(1),
    merchant: z.string().min(1),
    type: z.string().optional(),
    account: z.string().optional(),
  }),
  defaultType: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
});

const DATE_FORMATS = ["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "dd MMM yyyy"];

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,]/g, "").replace(/Rs\.?/i, "").trim();
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)/);
  return m ? Math.abs(parseFloat(m[1])) : null;
}
function parseCsvDate(raw: string): Date | null {
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(raw.trim(), fmt, new Date());
    if (isValid(d)) return fromZonedTime(d, "Asia/Kolkata");
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

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = BodySchema.parse(await req.json());
    const buf = await readStashed(body.token);
    const parsed = Papa.parse<Record<string, string>>(buf.toString("utf8"), { header: true, skipEmptyLines: true });
    const errors: { row: number; reason: string }[] = [];
    let inserted = 0, duplicates = 0;

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rawAmount = row[body.mapping.amount];
      const rawDate = row[body.mapping.date];
      const rawMerchant = row[body.mapping.merchant];
      const amount = rawAmount ? parseAmount(rawAmount) : null;
      const txDate = rawDate ? parseCsvDate(rawDate) : null;
      if (!amount || !txDate || !rawMerchant) {
        errors.push({ row: i + 2, reason: `Unparseable: amount=${rawAmount}, date=${rawDate}, merchant=${rawMerchant}` });
        continue;
      }
      const type = parseType(body.mapping.type ? row[body.mapping.type] : undefined, body.defaultType);
      const merchantNormalized = normalizeMerchant(rawMerchant);
      const category = await categorize(userId, merchantNormalized);
      const out = await insertOrLog(userId, {
        amount,
        transactionDate: txDate,
        merchant: rawMerchant,
        merchantNormalized,
        category,
        type,
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
