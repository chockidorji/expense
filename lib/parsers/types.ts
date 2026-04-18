export type Bank = "HDFC" | "SBI" | "ICICI" | "AXIS" | "KOTAK";

export type ParsedTransaction = {
  amount: number;
  type: "DEBIT" | "CREDIT";
  transactionDate: Date;
  merchant: string;
  bankAccount?: string;
  referenceNumber?: string;
  bank: Bank;
};

export interface BankParser {
  name: Bank;
  senderPatterns: RegExp[];
  parse(input: { subject: string; plainText: string; htmlText: string; fromHeader: string }): ParsedTransaction | null;
}
