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
  // emailDate: header `Date:` from the Gmail message — used as a fallback for
  // alert formats where the bank doesn't include the transaction date in the
  // body (e.g. HDFC's "Transfer to payee … via Online Banking" alert).
  parse(input: { subject: string; plainText: string; htmlText: string; fromHeader: string; emailDate?: Date }): ParsedTransaction | null;
}
