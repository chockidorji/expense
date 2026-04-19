"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  amount: string;
  transactionDate: string;
  merchant: string;
  category: string;
  type: "DEBIT" | "CREDIT";
};

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default function RecentTxns({ from, to }: { from?: string; to?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  async function load() {
    const p = new URLSearchParams();
    p.set("limit", "5");
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(`${to}T23:59:59+05:30`).toISOString());
    const r = await fetch(`/api/transactions?${p}`);
    if (!r.ok) return setRows([]);
    const j = await r.json();
    setRows(j.rows.slice(0, 5));
  }

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("expense-tracker:transaction-added", handler);
    return () => window.removeEventListener("expense-tracker:transaction-added", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <Card className="md:hidden">
      <div className="px-4 pt-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Recent</h3>
        <Link href="/transactions" className="text-xs text-primary hover:underline cursor-pointer">
          See all →
        </Link>
      </div>
      <div className="pb-1">
        {rows === null ? (
          <div className="h-24 grid place-items-center text-xs text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="h-24 grid place-items-center text-xs text-muted-foreground">No transactions yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.merchant}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <span className="capitalize inline-flex px-1.5 py-0.5 rounded-md bg-muted text-[10px]">{r.category}</span>
                    <span>·</span>
                    <span>{dateFmt.format(new Date(r.transactionDate))}</span>
                  </div>
                </div>
                <div className={cn("text-sm font-semibold tabular-nums whitespace-nowrap", r.type === "DEBIT" ? "text-foreground" : "text-emerald-700 dark:text-emerald-500")}>
                  {r.type === "DEBIT" ? "-" : "+"}{fmt.format(Number(r.amount))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
