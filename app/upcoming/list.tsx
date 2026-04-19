"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

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

function bucketKey(d: number): "overdue" | "today" | "this-week" | "next-week" | "later" {
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "this-week";
  if (d <= 14) return "next-week";
  return "later";
}

const BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  "this-week": "This week",
  "next-week": "Next week",
  later: "Later this month",
};

export default function UpcomingList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/upcoming?horizonDays=60");
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
      toast.success(`+${j.inserted} new · ${j.matched} matched · ${j.expired} expired`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    const r = await fetch(`/api/upcoming/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    if (!r.ok) {
      toast.error("Failed");
      return;
    }
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    toast.success("Dismissed");
  }

  async function markPaid(id: string) {
    const r = await fetch(`/api/upcoming/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "MATCHED" }),
    });
    if (!r.ok) {
      toast.error("Failed");
      return;
    }
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    toast.success("Marked as paid");
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows ?? []) {
      const key = bucketKey(daysUntil(r.dueDate));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const order = ["overdue", "today", "this-week", "next-week", "later"];
    return order.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const);
  }, [rows]);

  const total = (rows ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {rows ? (rows.length === 0 ? "No predictions yet." : `${rows.length} predicted · ${fmt.format(total)} total`) : ""}
        </div>
        <Button variant="outline" onClick={refresh} disabled={busy} className="min-h-[40px]">
          <RefreshCw className={cn("h-4 w-4 mr-1.5", busy && "animate-spin")} aria-hidden />
          {busy ? "Scanning…" : "Refresh"}
        </Button>
      </div>

      {rows === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              We&apos;ll predict upcoming payments by spotting merchants you&apos;ve paid on a regular cadence.
            </p>
            <Button onClick={refresh} disabled={busy}>
              {busy ? "Scanning…" : "Scan past transactions"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([bucket, items]) => (
            <section key={bucket} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{BUCKET_LABEL[bucket]}</h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {fmt.format(items.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
              <Card>
                <ul className="divide-y divide-border">
                  {items.map((r) => {
                    const d = daysUntil(r.dueDate);
                    const tone =
                      d < 0 ? "text-red-600 dark:text-red-500" : d === 0 ? "text-amber-600 dark:text-amber-500 font-medium" : "text-muted-foreground";
                    return (
                      <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" title={r.merchant}>
                            {r.merchant}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            {r.category && (
                              <span className="capitalize inline-flex px-1.5 py-0.5 rounded-md bg-muted text-[10px]">
                                {r.category}
                              </span>
                            )}
                            <span className={tone}>{dayFmt.format(new Date(r.dueDate))}</span>
                            {r.confidence != null && (
                              <>
                                <span>·</span>
                                <span>{r.confidence}% conf</span>
                              </>
                            )}
                            {r.source === "EMAIL" && (
                              <>
                                <span>·</span>
                                <span className="text-primary">from email</span>
                              </>
                            )}
                          </div>
                          {r.note && <div className="text-[11px] text-muted-foreground mt-0.5">{r.note}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-sm font-semibold tabular-nums whitespace-nowrap">{fmt.format(r.amount)}</div>
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => markPaid(r.id)}
                              aria-label={`Mark ${r.merchant} as paid`}
                              className="h-7 w-7 rounded-full hover:bg-emerald-500/15 grid place-items-center cursor-pointer transition-colors"
                              title="Mark as paid"
                            >
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => dismiss(r.id)}
                              aria-label={`Dismiss ${r.merchant}`}
                              className="h-7 w-7 rounded-full hover:bg-red-500/15 grid place-items-center cursor-pointer transition-colors"
                              title="Dismiss"
                            >
                              <X className="h-3.5 w-3.5 text-red-600 dark:text-red-500" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
