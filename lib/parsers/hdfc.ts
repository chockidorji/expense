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

// IMPS / NEFT / RTGS outgoing transfer:
//   "INR 1,00,000.00 has been debited from your account ending xxxxxxxxxx5470
//    on 29-04-26 and credited to the account ending xxxxxxxxxx1349 via IMPS."
// Bank doesn't include the beneficiary name — only the masked account number,
// so the merchant is synthesised as "<CHANNEL> to A/c xxxx<last4>". The user
// can map that → real merchant via the override system.
const IMPS_NEFT_DEBIT = new RegExp(
  String.raw`(?:Rs\.?\s*)?(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+has been debited from your account ending\s+x*(\d{4})\s+on\s+` +
    DATE_RE +
    String.raw`\s+and credited to (?:the\s+)?account ending\s+x*(\d{4})\s+via\s+(IMPS|NEFT|RTGS)`,
  "i",
);
const IMPS_NEFT_REF = /(?:IMPS|NEFT|RTGS)\s+Reference\s+No\.?:?\s*([A-Z0-9]+)/i;

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

// Card-descriptor character class — international card networks pass through
// merchant strings with messy punctuation: PayPal/Stripe use "*" as a separator
// ("PAYPAL *Apify"), invoices include "#", branded names mix case ("Apify"),
// and aggregators use "+", "_", ":", "()". Stay strict enough that " on "
// outside the merchant still serves as the date boundary. The `i` flag means
// A-Z covers a-z too.
const CARD_MERCHANT_CHARS = String.raw`[A-Z0-9 .,&'*#+_:()/\-]`;

// Credit-card spend. Two phrasings:
//  - "You've spent Rs 450.00 at SWIGGY on 15-04-2026"
//  - "Thank you for using your HDFC Bank Credit Card ending 1234 for Rs 450.00 at SWIGGY on 15-04-2026"
const CC_SPEND = new RegExp(
  String.raw`(?:spent|using[\s\S]{0,100}?for)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+at\s+(${CARD_MERCHANT_CHARS}+?)\s+on\s+` + DATE_RE,
  "i",
);
const CC_CARD_LAST4 = /(?:Credit Card |Debit Card )?ending\s+(?:in\s+)?(?:XX)?(\d{4})/i;

// HDFC's modern debit/credit card POS alert (the "Rs.X debited via Debit Card **NNNN" subject):
//   "Rs.3301.23 is debited from your HDFC Bank Debit Card ending 0161 at RUNWAY PRO PLAN on 27 Apr, 2026 at 14:37:14"
//   "Rs.2843.35 is debited from your HDFC Bank Debit Card ending 0161 at HEYGEN TECHNOLOGY INC. on 24 Apr, 2026 at ..."
//   "Rs.2889.17 is debited from your HDFC Bank Debit Card ending 9188 at PAYPAL *Apify inv#2026 on 03 May, 2026 at ..."
// Captures amount, card-last4, merchant, date.
const CARD_DEBIT = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+is\s+debited\s+from\s+your\s+HDFC\s+Bank\s+(?:Credit|Debit)\s+Card\s+ending\s+(?:in\s+)?(?:XX)?(\d{4})\s+at\s+(${CARD_MERCHANT_CHARS}+?)\s+on\s+` + DATE_RE,
  "i",
);

// ATM withdrawal alert (debit card cash withdrawal):
//   "Thank you for using your HDFC Bank Debit Card ending 9188 for ATM
//    withdrawal for Rs 9542.15 in SAMUT PRAKAN at BOOTH FX AIRPORT 1712 on
//    05-05-2026 04:32:47"
// Captures: card-last4, amount, location/city, ATM name, date.
const ATM_WITHDRAWAL = new RegExp(
  String.raw`HDFC Bank Debit Card ending\s+(?:in\s+)?(?:XX)?(\d{4})\s+for ATM withdrawal\s+for\s+Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+in\s+(${CARD_MERCHANT_CHARS}+?)\s+at\s+(${CARD_MERCHANT_CHARS}+?)\s+on\s+` + DATE_RE,
  "i",
);

// Online-Banking transfer DEBIT (no date in body — falls back to email Date header):
//   "Rs. 100000 has been deducted from your Account No. ending in XX1974 for
//    a Transfer to payee chocki technologies via HDFC Bank Online Banking"
// Captures: amount, source-account-last4, payee.
const OB_TRANSFER_DEBIT = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+has been deducted from your Account No\.?\s+ending in\s+(?:XX)?(\d{4})\s+for a Transfer to payee\s+([\s\S]+?)\s+via HDFC Bank Online Banking`,
  "i",
);

// TPT credit (the credit-side alert of an account-to-account transfer; pairs
// with the OB_TRANSFER_DEBIT or another transfer):
//   "Rs.INR 1,00,000.00 has been successfully added to your account ending
//    XX5470 from XXXXXXXXXX1974-TPT-HDFCC93C5664AF05-CHOCKEY DORJEE on
//    05-MAY-2026"
// Captures: amount, dest-account-last4, source-desc, date.
const TPT_CREDIT = new RegExp(
  String.raw`Rs\.?\s*(?:INR\s+)?([\d,]+(?:\.\d+)?)\s+has been successfully added to your account ending\s+(?:XX)?(\d{4})\s+from\s+([\s\S]+?)\s+on\s+` + DATE_RE,
  "i",
);

// E-mandate registration / auto-payment-success is a NOTIFICATION — the
// underlying card debit comes as a separate "Rs.X is debited..." alert.
// Parsing the E-mandate email too would double-count, so skip it.
const EMANDATE_REGISTRATION = /registered for E-mandate|Auto payment\)/i;

export const hdfcParser: BankParser = {
  name: "HDFC",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject, emailDate }) {
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

    m = text.match(IMPS_NEFT_DEBIT);
    if (m) {
      const [, amt, srcAcc, date, dstAcc, channel] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        const ref = text.match(IMPS_NEFT_REF)?.[1];
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: `${channel.toUpperCase()} to A/c xxxx${dstAcc}`,
          bankAccount: srcAcc,
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

    // ATM cash withdrawal — placed AFTER CARD_DEBIT because both share the
    // "HDFC Bank Debit Card ending NNNN" lead-in. ATM_WITHDRAWAL further
    // requires "for ATM withdrawal", so wins only on actual ATM alerts.
    m = text.match(ATM_WITHDRAWAL);
    if (m) {
      const [, card, amt, location, atmName, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: `ATM Withdrawal — ${clean(atmName)}, ${clean(location)}`,
          bankAccount: card,
          bank: "HDFC",
        };
      }
    }

    // TPT credit (paired with OB_TRANSFER_DEBIT, but appears as a SEPARATE
    // email on the destination side). Routes to "transfer" via categorizer.
    m = text.match(TPT_CREDIT);
    if (m) {
      const [, amt, dstAcc, sourceDesc, date] = m;
      const d = parseFlexibleDate(date);
      if (d) {
        // sourceDesc looks like "XXXXXXXXXX1974-TPT-HDFCC93C5664AF05-CHOCKEY DORJEE"
        // — pull the leading account-last4 if present so the merchant reads
        // "Transfer from A/c xxxx1974" (otherwise fall back to raw desc).
        const srcAccMatch = sourceDesc.match(/X+(\d{4})/);
        const merchant = srcAccMatch
          ? `Transfer from A/c xxxx${srcAccMatch[1]}`
          : `Transfer: ${clean(sourceDesc).slice(0, 80)}`;
        return {
          amount: num(amt),
          type: "CREDIT",
          transactionDate: d,
          merchant,
          bankAccount: dstAcc,
          bank: "HDFC",
        };
      }
    }

    // Online-Banking transfer DEBIT — body has no date, fall back to email
    // header Date. (Last in the chain so any pattern with a real body date
    // wins over this.)
    m = text.match(OB_TRANSFER_DEBIT);
    if (m) {
      const [, amt, srcAcc, payee] = m;
      const d = emailDate ?? new Date();
      return {
        amount: num(amt),
        type: "DEBIT",
        transactionDate: d,
        merchant: `Transfer to ${clean(payee).slice(0, 80)}`,
        bankAccount: srcAcc,
        bank: "HDFC",
      };
    }

    return null;
  },
};
