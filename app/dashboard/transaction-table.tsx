"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ALL_CATEGORIES } from "@/lib/categorizer";
import { toast } from "sonner";

type Row = { id: string; amount: string; transactionDate: string; merchant: string; category: string; type: "DEBIT" | "CREDIT"; source: "EMAIL" | "CSV" | "MANUAL" };

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function TransactionTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ category?: string; source?: string; minAmount?: string; maxAmount?: string; from?: string; to?: string }>({});

  async function load(reset = false) {
    setLoading(true);
    const p = new URLSearchParams();
    if (filters.category && filters.category !== "all") p.set("category", filters.category);
    if (filters.source && filters.source !== "all") p.set("source", filters.source);
    if (filters.minAmount) p.set("minAmount", filters.minAmount);
    if (filters.maxAmount) p.set("maxAmount", filters.maxAmount);
    if (filters.from) p.set("from", new Date(filters.from).toISOString());
    if (filters.to) p.set("to", new Date(filters.to).toISOString());
    if (!reset && cursor) p.set("cursor", cursor);
    const r = await fetch(`/api/transactions?${p}`);
    const j = await r.json();
    setRows(reset ? j.rows : [...rows, ...j.rows]);
    setCursor(j.nextCursor);
    setLoading(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(filters)]);

  async function updateCategory(id: string, category: string) {
    const r = await fetch(`/api/transactions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }) });
    if (!r.ok) { toast.error("Failed to update category"); return; }
    setRows(rs => rs.map(row => row.id === id ? { ...row, category } : row));
    toast.success("Category updated");
  }

  return (
    <Card>
      <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-6">
          <Input type="date" value={filters.from ?? ""} onChange={e => setFilters(f => ({ ...f, from: e.target.value || undefined }))} placeholder="From" />
          <Input type="date" value={filters.to ?? ""} onChange={e => setFilters(f => ({ ...f, to: e.target.value || undefined }))} placeholder="To" />
          <Select value={filters.category ?? "all"} onValueChange={(v: any) => setFilters(f => ({ ...f, category: v ?? undefined }))}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.source ?? "all"} onValueChange={(v: any) => setFilters(f => ({ ...f, source: v ?? undefined }))}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="CSV">CSV</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" value={filters.minAmount ?? ""} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value || undefined }))} placeholder="Min ₹" />
          <Input type="number" value={filters.maxAmount ?? ""} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value || undefined }))} placeholder="Max ₹" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.transactionDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</TableCell>
                  <TableCell>{r.merchant}</TableCell>
                  <TableCell>
                    <Select value={r.category} onValueChange={(v: any) => v && updateCategory(r.id, v)}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${r.type === "DEBIT" ? "" : "text-green-600"}`}>
                    {r.type === "DEBIT" ? "-" : "+"}{fmt.format(Number(r.amount))}
                  </TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !loading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transactions. Add one from the top-right.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {cursor && <Button variant="outline" disabled={loading} onClick={() => load()}>Load more</Button>}
      </CardContent>
    </Card>
  );
}
