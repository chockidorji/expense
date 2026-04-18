import type { BankParser } from "./types";
import { DATE_RE, clean, num, parseFlexibleDate, preparseBody } from "./_common";

const SENDER = [
  /@icicibank\.com$/i,
  /credit_cards@icicibank\.com/i,
  /alerts@icicibank\.com/i,
];

// "Dear Customer, Your ICICI Bank Credit Card XX1234 has been used for a transaction of INR 450.00 on Apr 15, 2026 at MAKEMYTRIP."
const CC_SPEND = new RegExp(
  String.raw`Credit Card\s+X+(\d{4})[\s\S]{0,100}?(?:INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s+on\s+` +
    DATE_RE +
    String.raw`\s+at\s+([A-Za-z0-9 .&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

// "Your a/c XX1234 debited with INR 500.00 on 15-04-2026. UPI ref 123456. Info: amazon@icici."
const UPI_DEBIT = new RegExp(
  String.raw`a\/c\s+X+(\d{4})\s+debited with\s+(?:INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s+on\s+` +
    DATE_RE +
    String.raw`\.?\s*UPI ref\s+(\d+)\.?\s*Info:\s*([A-Za-z0-9 .@&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

// "Your a/c XX1234 credited with INR 15,000.00 on 01-04-2026. Info: NEFT-JOHN DOE."
const ACC_CREDIT = new RegExp(
  String.raw`a\/c\s+X+(\d{4})\s+credited with\s+(?:INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s+on\s+` +
    DATE_RE +
    String.raw`\.?\s*Info:\s*([A-Za-z0-9 .&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

export const iciciParser: BankParser = {
  name: "ICICI",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject }) {
    const body = preparseBody(plainText, htmlText);
    const text = [subject, body].filter(Boolean).join("\n");

    let m = text.match(CC_SPEND);
    if (m) {
      const [, card, amt, date, merchant] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: card,
          bank: "ICICI",
        };
      }
    }

    m = text.match(UPI_DEBIT);
    if (m) {
      const [, acc, amt, date, ref, merchant] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: acc,
          referenceNumber: ref,
          bank: "ICICI",
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
          bank: "ICICI",
        };
      }
    }

    return null;
  },
};
