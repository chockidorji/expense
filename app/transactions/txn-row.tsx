"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_CATEGORIES } from "@/lib/categorizer";
import { cn } from "@/lib/utils";

export type TxnRow = {
  id: string;
  amount: string;
  transactionDate: string;
  merchant: string;
  category: string;
  type: "DEBIT" | "CREDIT";
  source: "EMAIL" | "CSV" | "MANUAL";
};

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function TxnRowCard({
  row,
  onCategoryChange,
}: {
  row: TxnRow;
  onCategoryChange: (id: string, category: string) => void;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium truncate" title={row.merchant}>
          {row.merchant}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={row.category} onValueChange={(v: any) => v && onCategoryChange(row.id, v)}>
            <SelectTrigger className="h-7 w-auto min-w-[8rem] text-xs py-0 px-2 rounded-full bg-muted border-transparent capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">{row.source.toLowerCase()}</span>
        </div>
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums whitespace-nowrap pt-1",
          row.type === "DEBIT" ? "text-foreground" : "text-emerald-700 dark:text-emerald-500"
        )}
      >
        {row.type === "DEBIT" ? "-" : "+"}
        {fmt.format(Number(row.amount))}
      </div>
    </li>
  );
}
