"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import CategoryBreakdownSheet from "./category-breakdown-sheet";
import { cn } from "@/lib/utils";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type Row = { category: string; budget: number; spent: number; pct: number; over: boolean };

export default function BudgetProgress({
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
  const title = monthLabel ? `Budget usage · ${monthLabel}` : "Budget usage";
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span>{title}</span>
            <Link href="/settings/budgets"><Button variant="ghost" size="sm">Edit budgets</Button></Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No budgets set yet.{" "}
              <Link href="/settings/budgets" className="underline">Set a per-category monthly budget</Link>{" "}
              to see spend-vs-target here.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map(r => {
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
                    className={cn(
                      "w-full text-left rounded-md -m-1 p-1 cursor-pointer hover:bg-muted/40 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    )}
                    aria-label={`View merchants in ${r.category}`}
                  >
                    <div className="flex items-baseline justify-between text-sm mb-1">
                      <span className="capitalize font-medium">{r.category}</span>
                      <span className={r.over ? "text-red-600 dark:text-red-500 font-medium" : "text-muted-foreground"}>
                        {fmt.format(r.spent)} / {fmt.format(r.budget)}{" "}
                        <span className="text-xs">({r.pct.toFixed(0)}%{r.over ? " · over" : ""})</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-[width]`}
                        style={{ width: `${clampedPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
