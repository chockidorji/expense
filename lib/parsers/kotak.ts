import type { BankParser } from "./types";
import { DATE_RE, clean, num, parseFlexibleDate, preparseBody } from "./_common";

const SENDER = [
  /@kotak\.com$/i,
  /kmbl\.alerts@kotak\.com/i,
  /creditcardalerts@kotak\.com/i,
];

// "Sent Rs.800 from Kotak Bank A/c XX1234 to MERCHANT on 10-04-26. UPI Ref 123456789. Not you? Call 18602662666."
const ACC_DEBIT = new RegExp(
  String.raw`Sent\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+from Kotak Bank A\/c\s+X+(\d{4})\s+to\s+([A-Za-z0-9 .&'/+\-]+?)\s+on\s+` +
    DATE_RE +
    String.raw`(?:[\s\S]{0,100}?UPI Ref\s*(\d+))?`,
  "i",
);

// "Your Kotak CC ending 1234 was used for Rs. 1,500 at FOODPANDA on 15-04-26."
const CC_SPEND = new RegExp(
  String.raw`Kotak CC ending\s+(\d{4})\s+was used for\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+at\s+([A-Za-z0-9 .&'/+\-]+?)\s+on\s+` +
    DATE_RE,
  "i",
);

// "Received Rs.20,000 in Kotak Bank A/c XX1234 on 01-04-26 from JOHN DOE UPI."
const ACC_CREDIT = new RegExp(
  String.raw`Received\s+Rs\.?\s*([\d,]+(?:\.\d+)?)\s+in Kotak Bank A\/c\s+X+(\d{4})\s+on\s+` +
    DATE_RE +
    String.raw`\s+from\s+([A-Za-z0-9 .&'/+\-]+?)(?:\.|\s*$)`,
  "i",
);

export const kotakParser: BankParser = {
  name: "KOTAK",
  senderPatterns: SENDER,
  parse({ plainText, htmlText, subject }) {
    const body = preparseBody(plainText, htmlText);
    const text = [subject, body].filter(Boolean).join("\n");

    let m = text.match(ACC_DEBIT);
    if (m) {
      const [, amt, acc, merchant, date, ref] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: acc,
          referenceNumber: ref,
          bank: "KOTAK",
        };
      }
    }

    m = text.match(CC_SPEND);
    if (m) {
      const [, card, amt, merchant, date] = m;
      const d = parseFlexibleDate(date);
      if (d && merchant) {
        return {
          amount: num(amt),
          type: "DEBIT",
          transactionDate: d,
          merchant: clean(merchant),
          bankAccount: card,
          bank: "KOTAK",
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
          bank: "KOTAK",
        };
      }
    }

    return null;
  },
};
