"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALL_CATEGORIES } from "@/lib/categorizer";
import { Chip } from "@/components/ui/chip";
import { SlidersHorizontal } from "lucide-react";
import FilterSheet, { type Filters } from "./filter-sheet";
import TxnRowCard, { type TxnRow } from "./txn-row";
import { toast } from "sonner";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function dayGroupKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dayGroupLabel(key: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const yesterday = new Date(Date.now() - 86400e3).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(key + "T00:00:00+05:30").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: "Asia/Kolkata",
  });
}

export default function TransactionsList({
  initialFrom,
  initialTo,
  initialCategory,
}: {
  initialFrom?: string;
  initialTo?: string;
  initialCategory?: string;
}) {
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ from: initialFrom, to: initialTo, category: initialCategory });
  const [sheetOpen, setSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function load(reset = false) {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.category) p.set("category", filters.category);
      if (filters.source) p.set("source", filters.source);
      if (filters.minAmount) p.set("minAmount", filters.minAmount);
      if (filters.maxAmount) p.set("maxAmount", filters.maxAmount);
      if (filters.from) p.set("from", new Date(filters.from).toISOString());
      if (filters.to) p.set("to", new Date(`${filters.to}T23:59:59+05:30`).toISOString());
      if (!reset && cursor) p.set("cursor", cursor);
      const r = await fetch(`/api/transactions?${p}`);
      const j = await r.json();
      setRows((prev) => (reset ? j.rows : [...prev, ...j.rows]));
      setCursor(j.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    const handler = () => load(true);
    window.addEventListener("expense-tracker:transaction-added", handler);
    return () => window.removeEventListener("expense-tracker:transaction-added", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sentinelRef.current || !cursor) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && cursor) {
          load(false);
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loading]);

  async function updateCategory(id: string, category: string) {
    const r = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!r.ok) {
      toast.error("Failed to update category");
      return;
    }
    setRows((rs) => rs.map((row) => (row.id === id ? { ...row, category } : row)));
    toast.success("Category updated");
  }

  const grouped = useMemo(() => {
    const map = new Map<string, TxnRow[]>();
    for (const r of rows) {
      const key = dayGroupKey(r.transactionDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  const activeChips: { key: keyof Filters; label: string }[] = [];
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${filters.from} → ${filters.to}`
        : filters.from
          ? `From ${filters.from}`
          : `Until ${filters.to}`;
    activeChips.push({ key: "from", label });
  }
  if (filters.category) activeChips.push({ key: "category", label: filters.category });
  if (filters.source) activeChips.push({ key: "source", label: filters.source.toLowerCase() });
  if (filters.minAmount) activeChips.push({ key: "minAmount", label: `≥ ₹${filters.minAmount}` });
  if (filters.maxAmount) activeChips.push({ key: "maxAmount", label: `≤ ₹${filters.maxAmount}` });

  function removeChip(key: keyof Filters) {
    setFilters((f) => {
      const nf = { ...f };
      if (key === "from") {
        delete nf.from;
        delete nf.to;
      } else {
        delete nf[key];
      }
      return nf;
    });
  }

  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer hover:bg-muted transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Filter
          </button>
          {activeChips.map((c) => (
            <Chip key={c.key + c.label} variant="outline" onRemove={() => removeChip(c.key)} title={String(c.label)}>
              <span className="capitalize">{c.label}</span>
            </Chip>
          ))}
          {activeChips.length > 0 && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline whitespace-nowrap cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        {grouped.length === 0 && !loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <p>No transactions match these filters.</p>
              {activeChips.length > 0 && (
                <Button variant="outline" className="mt-4" onClick={() => setFilters({})}>
                  Reset filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, list]) => {
              const dayTotal = list.reduce((s, r) => s + (r.type === "DEBIT" ? Number(r.amount) : 0), 0);
              return (
                <section key={day}>
                  <div className="flex items-center justify-between px-1 mb-1.5">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{dayGroupLabel(day)}</h3>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{fmt.format(dayTotal)}</span>
                  </div>
                  <Card>
                    <ul className="divide-y divide-border">
                      {list.map((r) => (
                        <TxnRowCard key={r.id} row={r} onCategoryChange={updateCategory} />
                      ))}
                    </ul>
                  </Card>
                </section>
              );
            })}
          </div>
        )}

        <div ref={sentinelRef} className="h-1" />
        {loading && <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>}

        <FilterSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          filters={filters}
          onApply={setFilters}
          onReset={() => setFilters({})}
        />
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span>Transactions</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-6">
              <Input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
                placeholder="From"
              />
              <Input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
                placeholder="To"
              />
              <Select
                value={filters.category ?? "all"}
                onValueChange={(v: any) => setFilters((f) => ({ ...f, category: v === "all" ? undefined : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {ALL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.source ?? "all"}
                onValueChange={(v: any) => setFilters((f) => ({ ...f, source: v === "all" ? undefined : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={filters.minAmount ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value || undefined }))}
                placeholder="Min ₹"
              />
              <Input
                type="number"
                value={filters.maxAmount ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value || undefined }))}
                placeholder="Max ₹"
              />
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.transactionDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</TableCell>
                      <TableCell>{r.merchant}</TableCell>
                      <TableCell className={`text-right tabular-nums ${r.type === "DEBIT" ? "" : "text-green-600"}`}>
                        {r.type === "DEBIT" ? "-" : "+"}
                        {fmt.format(Number(r.amount))}
                      </TableCell>
                      <TableCell>
                        <Select value={r.category} onValueChange={(v: any) => v && updateCategory(r.id, v)}>
                          <SelectTrigger className="h-8 w-40">
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
                      </TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.source}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No transactions in this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {cursor && (
              <Button variant="outline" disabled={loading} onClick={() => load()}>
                Load more
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
