import type { BankParser } from "./types";
import { DATE_RE, clean, num, parseFlexibleDate, preparseBody } from "./_common";

const SENDER = [
  /@hdfcbank\.bank\.in/i,
  /@hdfcbank\.net/i,
  /emailstatements\.hdfcbank@hdfcbank\.net/i,
];

// UPI debit: "Rs.X has been debited from (your HDFC Bank)? account (ending)? XXXX to VPA xxx on DATE"
const UPI_DEBIT = new RegExp(
  String.raw`Rs\.?\s*([\d,]+(?:\.\d+)?)\s+has been debited from (?:your\s+)?(?:HDFC Bank\s+)?account\s+(?:ending\s+)?(?:X+)?(\d{4})\s+to\s+VPA\s+([A-Za-z0-9._@+/\-]+)(?:\s+([A-Z][A-Za-z0-9 .&'/+\-]{0,100}?))?\s+on\s+` + DATE_RE,
  "i",
);
const UPI_REF = /UPI transaction reference number is\s*([A-Z0-9]+)/i;

// UPI credit: "Rs. 4000.00 is successfully credited to your account **1974 by VPA 9436045075@ybl DAVID SANGTAM on 31-05-25"
const UPI_CREDIT = new RegExp(
  String.raw`Rs\.?\s*([\d,]+(?:\.\d+)?)\s+is\s+(?:successfully\s+)?credited to your account\s+\*+(\d{4})\s+by\s+VPA\s+([A-Za-z0-9._@+/\-]+)(?:\s+([A-Z][A-Za-z0-9 .&'/+\-]{0,100}?))?\s+on\s+` + DATE_RE,
  "i",
);

// SI / merchant-linked debit: "Rs. INR 10,988.21 is deducted from your account ending XX5470 and added to ME DC SI ... CLAUDE.AI SUBSCRIPTION account on 13-FEB-2026"
const SI_DEBIT = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+is deducted from your account ending\s+(?:XX)?(\d{4})\s+and added to\s+([\s\S]+?)\s+account on\s+` + DATE_RE,
  "i",
);

// Account credit with Info block: "Rs.X has been credited to your HDFC Bank account XXXXYYYY on DATE. Info: NEFT-FOO"
const CREDIT_ACC = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+has been credited to your (?:HDFC Bank\s+)?account\s+(?:ending\s+)?(?:X+)?(\d{4})\s+on\s+` + DATE_RE + String.raw`[\s\S]{0,100}?Info:\s*([^.]+?)(?:\.|Avl|$)`,
  "i",
);

// Account credit without Info block
const CREDIT_ACC_SIMPLE = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+(?:has been\s+)?credited to your (?:HDFC Bank\s+)?account\s+(?:ending\s+)?(?:X+)?(\d{4})[\s\S]{0,100}?on\s+` + DATE_RE,
  "i",
);

// Credit-card spend. Two phrasings:
//  - "You've spent Rs 450.00 at SWIGGY on 15-04-2026"
//  - "Thank you for using your HDFC Bank Credit Card ending 1234 for Rs 450.00 at SWIGGY on 15-04-2026"
const CC_SPEND = new RegExp(
  String.raw`(?:spent|using[\s\S]{0,100}?for)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+at\s+([A-Z0-9 .&'/\-]+?)\s+on\s+` + DATE_RE,
  "i",
);
const CC_CARD_LAST4 = /(?:Credit Card |Debit Card )?ending\s+(?:in\s+)?(?:XX)?(\d{4})/i;

// HDFC's modern debit/credit card POS alert (the "Rs.X debited via Debit Card **NNNN" subject):
//   "Rs.3301.23 is debited from your HDFC Bank Debit Card ending 0161 at RUNWAY PRO PLAN on 27 Apr, 2026 at 14:37:14"
//   "Rs.2843.35 is debited from your HDFC Bank Debit Card ending 0161 at HEYGEN TECHNOLOGY INC. on 24 Apr, 2026 at ..."
// Captures amount, card-last4, merchant, date.
const CARD_DEBIT = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+is\s+debited\s+from\s+your\s+HDFC\s+Bank\s+(?:Credit|Debit)\s+Card\s+ending\s+(?:in\s+)?(?:XX)?(\d{4})\s+at\s+([A-Z0-9 .&'/\-]+?)\s+on\s+` + DATE_RE,
  "i",
);

// E-mandate registration / auto-payment-success is a NOTIFICATION — the
// underlying card debit comes as a separate "Rs.X is debited..." alert.
// Parsing the E-mandate email too would double-count, so skip it.
const EMANDATE_REGISTRATION = /registered for E-mandate|Auto payment\)/i;

export const hdfcParser: BankParser = {
  name: "HDFC",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject }) {
    const body = preparseBody(plainText, htmlText);
    const text = [subject, body].filter(Boolean).join("\n");

    if (EMANDATE_REGISTRATION.test(text)) return null;

    let m = text.match(UPI_DEBIT);
    if (m) {
      const [, amt, acc, vpa, payeeName, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        const ref = text.match(UPI_REF)?.[1];
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(payeeName || vpa),
          bankAccount: acc,
          referenceNumber: ref,
          bank: "HDFC",
        };
      }
    }

    m = text.match(UPI_CREDIT);
    if (m) {
      const [, amt, acc, vpa, payerName, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        const ref = text.match(UPI_REF)?.[1];
        return {
          amount: num(amt),
          type: "CREDIT",
          transactionDate: d,
          merchant: clean(payerName || vpa),
          bankAccount: acc,
          referenceNumber: ref,
          bank: "HDFC",
        };
      }
    }

    m = text.match(SI_DEBIT);
    if (m) {
      const [, amt, acc, merchant, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        return { amount: num(amt), type: "DEBIT", transactionDate: d, merchant: clean(merchant), bankAccount: acc, bank: "HDFC" };
      }
    }

    m = text.match(CREDIT_ACC);
    if (m) {
      const [, amt, acc, date, info] = m;
      const d = date ? parseFlexibleDate(date) : null;
      if (d && info) {
        return { amount: num(amt), type: "CREDIT", transactionDate: d, merchant: clean(info), bankAccount: acc, bank: "HDFC" };
      }
    }

    m = text.match(CREDIT_ACC_SIMPLE);
    if (m) {
      const [, amt, acc, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        return { amount: num(amt), type: "CREDIT", transactionDate: d, merchant: "Credit", bankAccount: acc, bank: "HDFC" };
      }
    }

    m = text.match(CC_SPEND);
    if (m) {
      const [, amt, merchant, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        const card = text.match(CC_CARD_LAST4)?.[1];
        return { amount: num(amt), type: "DEBIT", transactionDate: d, merchant: clean(merchant), bankAccount: card, bank: "HDFC" };
      }
    }

    // Modern HDFC card-POS alert ("Rs.X is debited from your HDFC Bank Debit
    // Card ending NNNN at MERCHANT on DATE") — this is the dominant format
    // for Visa/Mastercard POS spend in 2026+.
    m = text.match(CARD_DEBIT);
    if (m) {
      const [, amt, card, merchant, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        return { amount: num(amt), type: "DEBIT", transactionDate: d, merchant: clean(merchant), bankAccount: card, bank: "HDFC" };
      }
    }

    return null;
  },
};
