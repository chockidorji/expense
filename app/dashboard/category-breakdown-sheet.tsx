"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayMerchant } from "@/lib/merchant-display";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function formatTxnWhen(iso: string): string {
  const d = new Date(iso);
  // IST midnight transactions (e.g. 00:00 +05:30) are date-only; don't show
  // a meaningless "12:00 AM".
  const istHours = d.getUTCHours() * 60 + d.getUTCMinutes();
  const midnightIstMinutes = (24 * 60 - 5 * 60 - 30) % (24 * 60); // 18:30 UTC = 00:00 IST
  const isMidnightIst = istHours === midnightIstMinutes;
  return isMidnightIst ? dayFmt.format(d) : `${dayFmt.format(d)} · ${timeFmt.format(d)}`;
}

type MerchantRow = {
  merchant: string;
  amount: number;
  count: number;
  firstDate?: string | null;
  lastDate?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: string | null;
  monthLabel: string;
  fromISO: string;
  toISO: string;
  monthKey: string;
};

export default function CategoryBreakdownSheet({
  open,
  onOpenChange,
  category,
  monthLabel,
  fromISO,
  toISO,
  monthKey,
}: Props) {
  const [rows, setRows] = useState<MerchantRow[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !category) return;
    setLoading(true);
    setRows(null);
    const p = new URLSearchParams({ category, from: fromISO, to: toISO });
    fetch(`/api/categories/breakdown?${p}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(j.merchants ?? []);
        setTotal(j.total ?? 0);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, category, fromISO, toISO]);

  const title = category ? `${category} · ${monthLabel}` : "";
  const maxAmount = rows && rows.length > 0 ? Math.max(...rows.map((r) => r.amount)) : 0;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title}>
        <div className="mb-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total</div>
          <div className="text-3xl font-semibold tabular-nums">{fmt.format(total)}</div>
          {rows && (
            <div className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "merchant" : "merchants"} · {rows.reduce((s, r) => s + r.count, 0)} txns
            </div>
          )}
        </div>

        {loading && <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>}

        {!loading && rows && rows.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No spend in this category for this month.
          </div>
        )}

        {!loading && rows && rows.length > 0 && (
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const pct = maxAmount > 0 ? (r.amount / maxAmount) * 100 : 0;
              return (
                <li key={r.merchant} className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" title={r.merchant}>
                        {displayMerchant(r.merchant)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.count === 1 && r.firstDate ? (
                          <>{formatTxnWhen(r.firstDate)}</>
                        ) : r.count > 1 && r.firstDate && r.lastDate && r.firstDate !== r.lastDate ? (
                          <>
                            {r.count} txns · {dayFmt.format(new Date(r.firstDate))} → {dayFmt.format(new Date(r.lastDate))}
                          </>
                        ) : (
                          <>
                            {r.count} {r.count === 1 ? "txn" : "txns"}
                            {r.lastDate ? <> · {dayFmt.format(new Date(r.lastDate))}</> : null}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                      {fmt.format(r.amount)}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full bg-foreground/60 rounded-full transition-[width]")}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {category && (
          <div className="mt-5 pt-4 border-t flex flex-col gap-2 md:flex-row md:justify-end">
            <Link
              href={`/transactions?month=${encodeURIComponent(monthKey)}&category=${encodeURIComponent(category)}`}
              className="cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              <Button variant="outline" className="w-full md:w-auto min-h-[44px]">
                See all {category} transactions →
              </Button>
            </Link>
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
