import type { BankParser } from "./types";
import { DATE_RE, clean, num, parseFlexibleDate, preparseBody } from "./_common";

const SENDER = [
  /@sbi\.co\.in$/i,
  /donotreply\.sbiatm@alerts\.sbi\.co\.in/i,
  /onlinesbi@sbi\.co\.in/i,
  /@sbicard\.com$/i,
];

// "Dear SBI UPI User, ur A/C XXXXX1234 debited by Rs.500.00 on 15Apr24 trf to SWIGGY Refno 123456789."
const ACC_DEBIT = new RegExp(
  String.raw`ur\s+A\/C\s+X+(\d{4})\s+debited by\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+on\s+` +
    DATE_RE +
    String.raw`\s+trf to\s+([A-Za-z0-9 .&'/+\-]+?)(?:\s+Refno\s+(\d+))?(?:\.|\s|$)`,
  "i",
);

// "Rs.1,250.00 was spent on your SBI Credit Card ending 1234 at AMAZON INDIA on 10/04/2026."
const CC_SPEND = new RegExp(
  String.raw`Rs\.?\s*([\d,]+(?:\.\d+)?)\s+was spent on your SBI Credit Card ending\s+(\d{4})\s+at\s+([A-Za-z0-9 .&'/+\-]+?)\s+on\s+` +
    DATE_RE,
  "i",
);

// "Dear Customer, your A/c XX1234 has been credited with Rs. 25,000.00 on 01/04/2026 by NEFT from ACME CORP."
const ACC_CREDIT = new RegExp(
  String.raw`A\/c\s+X+(\d{4})\s+has been credited with\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+on\s+` +
    DATE_RE +
    String.raw`\s+by\s+\w+\s+from\s+([A-Za-z0-9 .&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

export const sbiParser: BankParser = {
  name: "SBI",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject }) {
    const body = preparseBody(plainText, htmlText);
    const text = [subject, body].filter(Boolean).join("\n");

    let m = text.match(ACC_DEBIT);
    if (m) {
      const [, acc, amt, date, merchant, ref] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: acc,
          referenceNumber: ref,
          bank: "SBI",
        };
      }
    }

    m = text.match(CC_SPEND);
    if (m) {
      const [, amt, card, merchant, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: card,
          bank: "SBI",
        };
      }
    }

    m = text.match(ACC_CREDIT);
    if (m) {
      const [, acc, amt, date, merchant] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "CREDIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: acc,
          bank: "SBI",
        };
      }
    }

    return null;
  },
};
