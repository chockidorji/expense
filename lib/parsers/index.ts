import type { BankParser, ParsedTransaction } from "./types";
import { hdfcParser } from "./hdfc";
import { sbiParser } from "./sbi";
import { iciciParser } from "./icici";

export const PARSERS: BankParser[] = [hdfcParser, sbiParser, iciciParser /* more added in step 6 */];

export function detectBankAndParse(input: { subject: string; plainText: string; htmlText: string; fromHeader: string }): ParsedTransaction | null {
  for (const p of PARSERS) {
    if (p.senderPatterns.some(re => re.test(input.fromHeader))) {
      const result = p.parse(input);
      if (result) return result;
    }
  }
  return null;
}

export function allBankSenderQuery(newerThanDays = 1): string {
  const senders: Record<string, string[]> = {
    HDFC: ["alerts@hdfcbank.bank.in", "alerts@hdfcbank.net", "emailstatements.hdfcbank@hdfcbank.net"],
    SBI: ["onlinesbi@sbi.co.in", "donotreply.sbiatm@alerts.sbi.co.in", "creditcards@sbicard.com"],
    ICICI: ["alerts@icicibank.com", "credit_cards@icicibank.com"],
    // Axis/Kotak added in Step 6
  };
  const all = Object.values(senders).flat();
  return `from:(${all.join(" OR ")}) newer_than:${newerThanDays}d`;
}
