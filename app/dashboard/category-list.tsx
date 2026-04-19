"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import CategoryBreakdownSheet from "./category-breakdown-sheet";
import { cn } from "@/lib/utils";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const COLORS = [
  "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6",
  "#f97316", "#8b5cf6", "#84cc16", "#ec4899", "#64748b", "#06b6d4",
];

type Item = { category: string; amount: number };

export default function CategoryList({
  data,
  monthLabel,
  fromISO,
  toISO,
  monthKey,
  title = "Spend by category",
}: {
  data: Item[];
  monthLabel?: string;
  fromISO: string;
  toISO: string;
  monthKey: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <>
      <Card>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {title}{monthLabel ? ` · ${monthLabel}` : ""}
          </h3>
          <span className="text-xs text-muted-foreground">tap for detail</span>
        </div>
        <ul className="divide-y divide-border">
          {data.map((d, i) => {
            const pct = total > 0 ? (d.amount / total) * 100 : 0;
            const color = COLORS[i % COLORS.length];
            return (
              <li key={d.category}>
                <button
                  type="button"
                  onClick={() => { setSelected(d.category); setOpen(true); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left",
                    "hover:bg-muted/50 transition-colors",
                    "focus-visible:outline-none focus-visible:bg-muted/50"
                  )}
                  aria-label={`View merchants in ${d.category}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize truncate">{d.category}</span>
                      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                        {fmt.format(d.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                      />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{pct.toFixed(1)}% of total</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
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
