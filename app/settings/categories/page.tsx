"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import MobileHeader from "@/components/mobile/mobile-header";

type Row = { id: string; merchantNormalized: string; category: string; createdAt: string };

export default function CategoryOverridesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/overrides");
    if (!r.ok) {
      toast.error("Failed to load overrides");
      setLoading(false);
      return;
    }
    const j = await r.json();
    setRows(j.rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(merchantNormalized: string) {
    const r = await fetch(`/api/overrides/${encodeURIComponent(merchantNormalized)}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("Failed to remove");
      return;
    }
    toast.success("Override removed");
    load();
  }

  return (
    <>
      <MobileHeader title="Overrides" />
      <main className="mx-auto max-w-3xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-4">
        <div className="hidden md:flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Category overrides</h1>
          <Link href="/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>
        <Link
          href="/settings"
          className="md:hidden inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Settings
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Learned merchant → category</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mobile: card list */}
            <ul className="md:hidden divide-y divide-border -mx-4">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] text-muted-foreground truncate" title={r.merchantNormalized}>
                      {r.merchantNormalized}
                    </div>
                    <div className="text-sm capitalize font-medium">{r.category}</div>
                  </div>
                  <Button size="default" variant="ghost" onClick={() => remove(r.merchantNormalized)} className="min-h-[44px]">
                    Remove
                  </Button>
                </li>
              ))}
              {!loading && rows.length === 0 && (
                <li className="py-10 text-center text-sm text-muted-foreground">
                  No overrides yet. Edit a transaction category to create one.
                </li>
              )}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Merchant (normalized)</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.merchantNormalized}</TableCell>
                      <TableCell className="capitalize">{r.category}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove(r.merchantNormalized)}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No overrides yet. Edit a transaction category to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
