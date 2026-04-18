"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AddTransaction() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: "", merchant: "", date: new Date().toISOString().slice(0, 10), type: "DEBIT" as "DEBIT" | "CREDIT" });

  async function submit() {
    setSubmitting(true);
    const r = await fetch("/api/transactions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(form.amount),
        merchant: form.merchant,
        transactionDate: new Date(`${form.date}T00:00:00+05:30`).toISOString(),
        type: form.type,
      }),
    });
    setSubmitting(false);
    if (!r.ok) { toast.error("Failed to add transaction"); return; }
    const j = await r.json();
    if (j.status === "duplicate") toast.info("Duplicate — logged, not inserted.");
    else toast.success("Transaction added");
    setOpen(false);
    setForm({ amount: "", merchant: "", date: new Date().toISOString().slice(0, 10), type: "DEBIT" });
    window.dispatchEvent(new CustomEvent("expense-tracker:transaction-added"));
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Add transaction</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Add transaction</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div className="grid gap-1.5"><Label>Merchant</Label><Input value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} /></div>
          <div className="grid gap-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v: any) => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBIT">Debit (expense)</SelectItem>
                <SelectItem value="CREDIT">Credit (income)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !form.amount || !form.merchant}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
