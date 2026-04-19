"use client";
import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import CategoryBreakdownSheet from "./category-breakdown-sheet";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type Row = { category: string; budget: number; spent: number; pct: number; over: boolean };

export default function BudgetStrip({
  rows,
  monthLabel,
  fromISO,
  toISO,
  monthKey,
}: {
  rows: Row[];
  monthLabel?: string;
  fromISO: string;
  toISO: string;
  monthKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card className="md:hidden">
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">No budgets set</div>
            <div className="text-xs text-muted-foreground">Set per-category caps to track overspend.</div>
          </div>
          <Link
            href="/settings/budgets"
            className="shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-medium px-3 py-2 cursor-pointer hover:bg-primary/90 transition-colors"
          >
            Set up
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <>
      <section className="md:hidden -mx-4">
        <div className="flex items-center justify-between px-4 mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">Budgets</h3>
          <Link href="/settings/budgets" className="text-xs text-primary underline-offset-4 hover:underline cursor-pointer">
            Edit
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar snap-x snap-mandatory">
          {rows.map((r) => {
            const clampedPct = Math.min(r.pct, 100);
            const barColor = r.over
              ? "bg-red-600 dark:bg-red-500"
              : r.pct > 80
                ? "bg-amber-500"
                : "bg-emerald-600 dark:bg-emerald-500";
            return (
              <button
                key={r.category}
                type="button"
                onClick={() => { setSelected(r.category); setOpen(true); }}
                className="block snap-start shrink-0 w-44 rounded-xl bg-card ring-1 ring-foreground/10 p-3 cursor-pointer hover:ring-foreground/20 transition-all text-left"
                aria-label={`View merchants in ${r.category}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="capitalize text-sm font-medium truncate">{r.category}</span>
                  <span className={cn("text-[11px]", r.over ? "text-red-600 dark:text-red-500 font-medium" : "text-muted-foreground")}>
                    {r.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-1.5">
                  <div className={cn("h-full transition-[width]", barColor)} style={{ width: `${clampedPct}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {fmt.format(r.spent)} / {fmt.format(r.budget)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <CategoryBreakdownSheet
        open={open}
        onOpenChange={setOpen}
        category={selected}
        monthLabel={monthLabel ?? ""}
        fromISO={fromISO}
        toISO={toISO}
        monthKey={monthKey}
      />
    </>
  );
}
