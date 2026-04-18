import type { BankParser } from "./types";
import { DATE_RE, clean, num, parseFlexibleDate, preparseBody } from "./_common";

const SENDER = [
  /@axisbank\.com$/i,
  /alerts@axisbank\.com/i,
  /cc\.alerts@axisbank\.com/i,
];

// "INR 2,500.00 debited from A/c no. XX1234 on 10-04-26. Info: UPI/AMAZONPAY/RZPAMAZON."
const ACC_DEBIT = new RegExp(
  String.raw`(?:INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s+debited from\s+A\/c\s+(?:no\.?)?\s*X+(\d{4})\s+on\s+` +
    DATE_RE +
    String.raw`\.?\s*Info:\s*([A-Za-z0-9 .&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

// "Txn of INR 1,200 on Axis Credit Card XX1234 at FLIPKART on 12-04-26. Avl Lmt INR 50,000."
const CC_SPEND = new RegExp(
  String.raw`Txn of\s+(?:INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s+on Axis Credit Card\s+X+(\d{4})\s+at\s+([A-Za-z0-9 .&'/+\-]+?)\s+on\s+` +
    DATE_RE,
  "i",
);

// "INR 50,000 credited to A/c no. XX1234 on 01-04-26. Info: NEFT/ACMECORP/SALARY."
const ACC_CREDIT = new RegExp(
  String.raw`(?:INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s+credited to\s+A\/c\s+(?:no\.?)?\s*X+(\d{4})\s+on\s+` +
    DATE_RE +
    String.raw`\.?\s*Info:\s*([A-Za-z0-9 .&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

export const axisParser: BankParser = {
  name: "AXIS",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject }) {
    const body = preparseBody(plainText, htmlText);
    const text = [subject, body].filter(Boolean).join("\n");

    let m = text.match(ACC_DEBIT);
    if (m) {
      const [, amt, acc, date, merchant] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: acc,
          bank: "AXIS",
        };
      }
    }

    m = text.match(CC_SPEND);
    if (m) {
      const [, amt, card, merchant, date] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: card,
          bank: "AXIS",
        };
      }
    }

    m = text.match(ACC_CREDIT);
    if (m) {
      const [, amt, acc, date, merchant] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "CREDIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: acc,
          bank: "AXIS",
        };
      }
    }

    return null;
  },
};
