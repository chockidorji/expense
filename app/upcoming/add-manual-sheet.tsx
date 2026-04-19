"use client";
import { useState } from "react";
import { BottomSheet, BottomSheetContent, BottomSheetFooter } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_CATEGORIES } from "@/lib/categorizer";
import { toast } from "sonner";

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AddManualSheet({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [category, setCategory] = useState<string>("__none__");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMerchant("");
    setAmount("");
    setDueDate(todayISO());
    setCategory("__none__");
    setNote("");
  }

  async function submit() {
    const amt = Number(amount);
    if (!merchant.trim()) return toast.error("Merchant required");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be a positive number");
    if (!dueDate) return toast.error("Due date required");

    setSubmitting(true);
    try {
      const r = await fetch("/api/upcoming/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: merchant.trim(),
          amount: amt,
          dueDate,
          category: category === "__none__" ? undefined : category,
          note: note.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(typeof j?.error === "string" ? j.error : "Failed to add");
        return;
      }
      toast.success("Added");
      reset();
      onOpenChange(false);
      onAdded();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="Add upcoming payment">
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="upc-merchant">Merchant</Label>
            <Input id="upc-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Rent · Suprabha" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="upc-amount">Amount (₹)</Label>
              <Input
                id="upc-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="upc-date">Due date</Label>
              <Input id="upc-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v: any) => setCategory((v as string | null) ?? "__none__")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not set</SelectItem>
                {ALL_CATEGORIES.filter((c) => c !== "uncategorized").map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="upc-note">Note (optional)</Label>
            <Input id="upc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. quarterly review" />
          </div>
        </div>
        <BottomSheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !merchant || !amount}>
            {submitting ? "Adding…" : "Add"}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
