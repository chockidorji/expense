import type { BankParser } from "./types";
import { parse as parseDate } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const SENDER = [/alerts@hdfcbank\.net/i, /emailstatements\.hdfcbank@hdfcbank\.net/i];

// HDFC credit card spend: "spent Rs 450.00 at SWIGGY on 15-04-2026"
const DEBIT_CC = /(?:spent|used).{0,30}?Rs\.?\s*([\d,]+(?:\.\d+)?)\s*(?:on|at)\s+(?:HDFC.*?Credit Card.*?)?(?:at\s+)?([A-Z0-9 .&'/\-]+?)\s+on\s+(\d{2}[-\/]\d{2}[-\/]\d{4})/is;
const CARD_LAST4 = /(?:Card|ending)\s+(?:XX)?(\d{4})/i;
const AUTH_CODE = /(?:Authorization code|Auth(?:\.|orization)? code|Ref(?:erence)? no\.?)\s*:?\s*([A-Z0-9]+)/i;

// HDFC account credit: "Rs.25000.00 has been credited to your HDFC Bank account XXXXXX5678 ... Info: NEFT-..."
const CREDIT_ACC = /Rs\.?\s*([\d,]+(?:\.\d+)?)\s+has been credited to your HDFC Bank account\s+X+(\d{4}).{0,200}?(?:on\s+(\d{2}[-\/]\d{2}[-\/]\d{4})).{0,200}?Info:\s*([^.]+?)(?:\.|Avl|$)/is;

// HDFC account debit (UPI or transfer): "Rs.1234.00 has been debited from account XXXXXX5678 to VPA/PAYEE on ..."
const DEBIT_ACC = /Rs\.?\s*([\d,]+(?:\.\d+)?)\s+has been debited from (?:your\s+)?(?:HDFC Bank\s+)?account\s+X+(\d{4}).{0,200}?(?:to|VPA)\s+([A-Z0-9 .&'/@\-]+?)(?:\s+on\s+(\d{2}[-\/]\d{2}[-\/]\d{4})|\.)/is;

function toIst(ddmmyyyy: string): Date {
  const normalized = ddmmyyyy.replace(/\//g, "-");
  const d = parseDate(normalized, "dd-MM-yyyy", new Date(2000, 0, 1));
  d.setHours(0, 0, 0, 0);
  return fromZonedTime(d, "Asia/Kolkata");
}
function num(s: string): number { return parseFloat(s.replace(/,/g, "")); }
function clean(s: string): string { return s.replace(/\s+/g, " ").trim(); }

export const hdfcParser: BankParser = {
  name: "HDFC",
  senderPatterns: SENDER,
  parse({ plainText, subject }) {
    const text = `${subject}\n${plainText}`;

    let m = text.match(DEBIT_CC);
    if (m) {
      const [, amt, merchant, date] = m;
      const card = text.match(CARD_LAST4)?.[1];
      const auth = text.match(AUTH_CODE)?.[1];
      return { amount: num(amt), type: "DEBIT", transactionDate: toIst(date), merchant: clean(merchant), bankAccount: card, referenceNumber: auth, bank: "HDFC" };
    }
    m = text.match(DEBIT_ACC);
    if (m) {
      const [, amt, acc, merchant, date] = m;
      return { amount: num(amt), type: "DEBIT", transactionDate: date ? toIst(date) : new Date(), merchant: clean(merchant), bankAccount: acc, bank: "HDFC" };
    }
    m = text.match(CREDIT_ACC);
    if (m) {
      const [, amt, acc, date, info] = m;
      return { amount: num(amt), type: "CREDIT", transactionDate: toIst(date), merchant: clean(info), bankAccount: acc, bank: "HDFC" };
    }
    return null;
  },
};
