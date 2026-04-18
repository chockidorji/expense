import type { BankParser } from "./types";
import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const SENDER = [
  /@hdfcbank\.bank\.in/i,
  /@hdfcbank\.net/i,
  /emailstatements\.hdfcbank@hdfcbank\.net/i,
];

// Accept: 06-03-26, 13-FEB-2026, 15-04-2026, 15/04/2026, 13-Feb-2026
const DATE_FORMATS = ["dd-MM-yy", "dd-MMM-yyyy", "dd-MM-yyyy", "dd/MM/yyyy", "dd-LLL-yyyy"];

function parseFlexibleDate(raw: string): Date | null {
  const trimmed = raw.trim();
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(trimmed, fmt, new Date(2000, 0, 1));
    if (isValid(d)) {
      d.setHours(0, 0, 0, 0);
      return fromZonedTime(d, "Asia/Kolkata");
    }
  }
  return null;
}

function num(s: string): number { return parseFloat(s.replace(/,/g, "")); }
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[.,]+$/, "").trim();
}

// Strip HTML to plain-ish text for regex extraction.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const DATE_RE = String.raw`(\d{1,2}[-\/][A-Za-z0-9]{2,4}[-\/]\d{2,4})`;

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
const CC_CARD_LAST4 = /(?:Credit Card )?ending\s+(?:XX)?(\d{4})/i;

// E-mandate registration is a NOTIFICATION, not a transaction — skip.
const EMANDATE_REGISTRATION = /registered for E-mandate|Auto payment\)/i;

export const hdfcParser: BankParser = {
  name: "HDFC",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject }) {
    const body = plainText && plainText.trim().length > 0 ? plainText : htmlToText(htmlText);
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

    return null;
  },
};
