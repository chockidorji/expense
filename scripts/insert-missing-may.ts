/* eslint-disable no-console */
/**
 * One-off: insert the 8 May 2026 bank-statement transactions that HDFC
 * never sent Gmail alerts for. Uses the same insertOrLog + categorize
 * pipeline as the live syncer so dedup + override rules apply.
 *
 * Run: pnpm tsx scripts/insert-missing-may.ts
 * Re-runnable: any row already present (per the unique constraint) goes
 * to the dedup_log table instead of double-inserting.
 */
import { prisma } from "../lib/db";
import { fromZonedTime } from "date-fns-tz";
import { insertOrLog, normalizeMerchant } from "../lib/dedup";
import { categorize } from "../lib/categorizer";
import { TxnSource, TxnType } from "@prisma/client";

type Entry = {
  date: string; // YYYY-MM-DD in IST
  merchant: string;
  amount: number;
  refNo: string;
  note: string; // why HDFC didn't email it
};

const ENTRIES: Entry[] = [
  // Person-to-person / self transfers HDFC didn't email.
  { date: "2026-05-04", merchant: "TPT to Chocki Technologies",     amount: 100,     refNo: "TPT-NDVWMMGLZVEC8DM3", note: "TPT debit, sub-threshold" },
  { date: "2026-05-04", merchant: "TPT to Chocki Technologies",     amount: 49000,   refNo: "TPT-HDFCC4297BD64DF91", note: "TPT debit, no alert" },
  { date: "2026-05-05", merchant: "EMI - HDFC Loan",                amount: 11566,   refNo: "EMI-1245-8366-CHQ-S",   note: "HDFC EMI debits, never emailed" },
  { date: "2026-05-19", merchant: "UPI Lite Top-up",                amount: 1000,    refNo: "LITE-613915973030",     note: "UPI-Lite wallet load" },
  { date: "2026-05-21", merchant: "UPI Lite Top-up",                amount: 1000,    refNo: "LITE-614178079955",     note: "UPI-Lite wallet load" },
  { date: "2026-05-22", merchant: "UPI Lite Top-up",                amount: 1000,    refNo: "LITE-650809772885",     note: "UPI-Lite wallet load" },
  { date: "2026-05-26", merchant: "MUNNI ROTIYA",                   amount: 4000,    refNo: "836871946147",          note: "HDFC silently skipped alert" },
  { date: "2026-05-27", merchant: "AMAR CHETRY CHAUHAN",            amount: 1100,    refNo: "540222195708",          note: "HDFC silently skipped alert" },
  // The dedup collision case — 10/05/26 had TWO charges at identical amount/
  // merchant 2 minutes apart. The unique-key migration in this same release
  // now allows both, but the second one was lost in the email sync. Adding
  // it manually with a distinct ref so the new constraint accepts it.
  { date: "2026-05-10", merchant: "HKD TRAN XUAN THUONG",           amount: 1185.07, refNo: "POS-613016490313",      note: "Second of two identical charges 2 min apart" },
  // Forex / international markup fees — HDFC never emails these; they only
  // appear in the monthly statement. Categorizer's `fees` rule catches them.
  { date: "2026-05-20", merchant: "ATM FEES INTL W/D INCL ST",      amount: 147.50,  refNo: "EPR2714046115992",      note: "Forex ATM fee for 05/05 withdrawal" },
  { date: "2026-05-20", merchant: "ATM FEES INTL W/D INCL ST",      amount: 147.50,  refNo: "EPR2714046115999",      note: "Forex ATM fee for 05/05 withdrawal" },
  { date: "2026-05-20", merchant: "DC INTL ATM W/D MARKUP ST",      amount: 394.10,  refNo: "EPR2714046116023",      note: "Forex markup for 05/05 withdrawal" },
  { date: "2026-05-21", merchant: "DC INTL ATM TXN DCC ST",         amount: 150.13,  refNo: "EPR2714148722073",      note: "Forex DCC fee for 07/05" },
  { date: "2026-05-22", merchant: "ATM FEES INTL W/D INCL ST",      amount: 147.50,  refNo: "EPR2714250924554",      note: "Forex ATM fee for 07/05 withdrawal" },
  { date: "2026-05-22", merchant: "DC INTL ATM W/D MARKUP ST",      amount: 786.49,  refNo: "EPR2714250924564",      note: "Forex markup for 07/05 withdrawal" },
  { date: "2026-05-23", merchant: "DC INTL ATM W/D MARKUP ST",      amount: 87.42,   refNo: "EPR2714362605771",      note: "Forex markup for 08/05" },
  { date: "2026-05-23", merchant: "ATM FEES INTL W/D INCL ST",      amount: 147.50,  refNo: "EPR2714362605766",      note: "Forex ATM fee for 08/05" },
  { date: "2026-05-23", merchant: "ATM FEES INTL W/D INCL ST",      amount: 147.50,  refNo: "EPR2714362605755",      note: "Forex ATM fee for 08/05" },
  { date: "2026-05-23", merchant: "DC INTL ATM W/D MARKUP ST",      amount: 310.42,  refNo: "EPR2714362605784",      note: "Forex markup for 08/05" },
  { date: "2026-05-23", merchant: "DC INTL POS TXN DCC ST",         amount: 1.18,    refNo: "EPR2714365098556",      note: "Forex DCC for 08/05" },
  { date: "2026-05-24", merchant: "DC INTL POS TXN MARKUP ST",      amount: 244.42,  refNo: "EPR2714467617067",      note: "Forex markup for 10/05" },
  { date: "2026-05-24", merchant: "DC INTL POS TXN MARKUP ST",      amount: 48.94,   refNo: "EPR2714467617075",      note: "Forex markup for 10/05" },
  { date: "2026-05-24", merchant: "DC INTL POS TXN MARKUP ST",      amount: 48.94,   refNo: "EPR2714467617070",      note: "Forex markup for 10/05" },
];

async function main() {
  const imapUser = process.env.IMAP_USER;
  if (!imapUser) throw new Error("IMAP_USER env var missing");
  const user = await prisma.user.findFirst({ where: { email: imapUser } });
  if (!user) throw new Error(`No user with email ${imapUser}`);

  let inserted = 0, dup = 0;
  for (const e of ENTRIES) {
    // Match the parser's date handling: take YYYY-MM-DD as local midnight in
    // Asia/Kolkata, convert to a UTC Date. Yields 18:30 UTC of the day before
    // — consistent with every other email-sourced row in the table.
    const istMidnight = new Date(e.date + "T00:00:00");
    const transactionDate = fromZonedTime(istMidnight, "Asia/Kolkata");
    const merchantNormalized = normalizeMerchant(e.merchant);
    const category = await categorize(user.id, merchantNormalized);

    const out = await insertOrLog(user.id, {
      amount: e.amount,
      transactionDate,
      merchant: e.merchant,
      merchantNormalized,
      category,
      type: TxnType.DEBIT,
      source: TxnSource.MANUAL,
      bankAccount: "1974",
      referenceNumber: e.refNo,
      rawData: { bank: "HDFC", manualEntry: true, note: e.note } as unknown as object,
    });

    if (out.status === "inserted") {
      inserted++;
      console.log(`✓ ${e.date}  ${e.merchant.padEnd(32)} ₹${e.amount.toLocaleString("en-IN").padStart(8)}  → ${category}`);
    } else {
      dup++;
      console.log(`· ${e.date}  ${e.merchant.padEnd(32)} ₹${e.amount.toLocaleString("en-IN").padStart(8)}  → already in DB (${out.reason})`);
    }
  }

  console.log(`\nSummary: ${inserted} inserted, ${dup} already existed`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
