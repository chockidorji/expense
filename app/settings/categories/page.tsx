"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import Link from "next/link";

type Row = { id: string; merchantNormalized: string; category: string; createdAt: string };

export default function CategoryOverridesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/overrides");
    if (!r.ok) { toast.error("Failed to load overrides"); setLoading(false); return; }
    const j = await r.json();
    setRows(j.rows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function remove(merchantNormalized: string) {
    const r = await fetch(`/api/overrides/${encodeURIComponent(merchantNormalized)}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Failed to remove"); return; }
    toast.success("Override removed");
    load();
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Category overrides</h1>
        <Link href="/dashboard"><Button variant="outline">Back to dashboard</Button></Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Learned merchant → category</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant (normalized)</TableHead>
                <TableHead>Category</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.merchantNormalized}</TableCell>
                  <TableCell className="capitalize">{r.category}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(r.merchantNormalized)}>Remove</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No overrides yet. Edit a transaction category on the dashboard to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
