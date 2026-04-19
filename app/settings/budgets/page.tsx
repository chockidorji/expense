"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ALL_CATEGORIES } from "@/lib/categorizer";
import MobileHeader from "@/components/mobile/mobile-header";

type BudgetRow = { id: string; category: string; amount: string };

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function BudgetSettingsPage() {
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/budgets");
    if (!r.ok) {
      toast.error("Failed to load budgets");
      setLoading(false);
      return;
    }
    const j = (await r.json()) as { rows: BudgetRow[] };
    const map: Record<string, string> = {};
    for (const row of j.rows) map[row.category] = row.amount;
    setBudgets(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(category: string) {
    const raw = budgets[category] ?? "";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Amount must be >= 0");
      return;
    }
    setSaving(category);
    const r = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, amount }),
    });
    setSaving(null);
    if (!r.ok) {
      toast.error("Save failed");
      return;
    }
    const j = await r.json();
    if (j.deleted) {
      setBudgets((b) => {
        const c = { ...b };
        delete c[category];
        return c;
      });
      toast.success(`Budget removed for ${category}`);
    } else {
      toast.success(`Saved: ${category} → ${fmt.format(amount)}`);
    }
  }

  const overallTotal = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <>
      <MobileHeader title="Budgets" />
      <main className="mx-auto max-w-3xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-4">
        <div className="hidden md:flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Monthly budgets</h1>
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
            <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span>Monthly limit per category</span>
              <span className="text-sm font-normal text-muted-foreground">Total: {fmt.format(overallTotal)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Enter an amount in ₹. Leave blank or set to 0 to clear. Budgets apply per IST calendar month.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {ALL_CATEGORIES.filter((c) => c !== "uncategorized").map((category) => (
                <div key={category} className="flex items-end gap-2">
                  <div className="grid gap-1.5 flex-1 min-w-0">
                    <Label className="capitalize" htmlFor={`budget-${category}`}>
                      {category}
                    </Label>
                    <Input
                      id={`budget-${category}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={budgets[category] ?? ""}
                      onChange={(e) => setBudgets((b) => ({ ...b, [category]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <Button
                    size="default"
                    disabled={loading || saving === category}
                    onClick={() => save(category)}
                    className="shrink-0 min-h-[44px]"
                  >
                    {saving === category ? "…" : "Save"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
