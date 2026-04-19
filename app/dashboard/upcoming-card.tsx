"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

type Row = {
  id: string;
  merchant: string;
  amount: number;
  dueDate: string;
  category: string | null;
  source: "PATTERN" | "EMAIL" | "MANUAL";
  confidence: number | null;
  note: string | null;
};

function daysUntil(iso: string): number {
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400e3);
}

function dueLabel(iso: string): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  const d = daysUntil(iso);
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, tone: "overdue" };
  if (d === 0) return { text: "Today", tone: "today" };
  if (d === 1) return { text: "Tomorrow", tone: "soon" };
  if (d <= 7) return { text: `in ${d}d`, tone: "soon" };
  return { text: dayFmt.format(new Date(iso)), tone: "later" };
}

export default function UpcomingCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/upcoming?horizonDays=30");
    if (!r.ok) return setRows([]);
    const j = await r.json();
    setRows(j.rows ?? []);
  }

  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch("/api/upcoming", { method: "POST" });
      if (!r.ok) {
        toast.error("Refresh failed");
        return;
      }
      const j = await r.json();
      toast.success(`Detected: +${j.inserted} new, ${j.matched} matched, ${j.expired} expired`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("expense-tracker:transaction-added", handler);
    return () => window.removeEventListener("expense-tracker:transaction-added", handler);
  }, []);

  const top3 = (rows ?? []).slice(0, 3);
  const total30 = (rows ?? []).reduce((s, r) => s + r.amount, 0);
  const hasOverdue = (rows ?? []).some((r) => daysUntil(r.dueDate) < 0);

  return (
    <Card>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            Upcoming · next 30 days
            {hasOverdue && <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-500" aria-label="overdue" />}
          </h3>
          {rows && rows.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {rows.length} predicted · {fmt.format(total30)} total
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            aria-label={busy ? "Refreshing" : "Refresh upcoming payments"}
            className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4 text-muted-foreground", busy && "animate-spin")} aria-hidden />
          </button>
          <Link href="/upcoming" className="text-xs text-primary hover:underline cursor-pointer">
            See all →
          </Link>
        </div>
      </div>

      {rows === null ? (
        <div className="h-20 grid place-items-center text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-5 text-center space-y-2">
          <div className="text-sm text-muted-foreground">No upcoming payments detected.</div>
          <Button size="sm" variant="outline" onClick={refresh} disabled={busy} className="min-h-[40px]">
            {busy ? "Scanning…" : "Scan past transactions"}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {top3.map((r) => {
            const due = dueLabel(r.dueDate);
            const toneClass =
              due.tone === "overdue"
                ? "text-red-600 dark:text-red-500"
                : due.tone === "today"
                  ? "text-amber-600 dark:text-amber-500 font-medium"
                  : due.tone === "soon"
                    ? "text-foreground"
                    : "text-muted-foreground";
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate" title={r.merchant}>
                    {r.merchant}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    {r.category && <span className="capitalize">{r.category}</span>}
                    {r.category && <span>·</span>}
                    <span className={toneClass}>{due.text}</span>
                    {r.confidence != null && r.confidence < 60 && (
                      <>
                        <span>·</span>
                        <span>~{r.confidence}% conf</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums whitespace-nowrap">{fmt.format(r.amount)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
