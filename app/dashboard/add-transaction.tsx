"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BottomSheet, BottomSheetContent, BottomSheetFooter } from "@/components/ui/bottom-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Fab from "@/components/mobile/fab";

type Form = { amount: string; merchant: string; date: string; type: "DEBIT" | "CREDIT" };

function initialForm(): Form {
  return { amount: "", merchant: "", date: new Date().toISOString().slice(0, 10), type: "DEBIT" };
}

function AddTransactionForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitting,
}: {
  form: Form;
  setForm: (u: (f: Form) => Form) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor="txn-amount">Amount (₹)</Label>
        <Input
          id="txn-amount"
          type="number"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="txn-merchant">Merchant</Label>
        <Input id="txn-merchant" value={form.merchant} onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="txn-date">Date</Label>
        <Input id="txn-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label>Type</Label>
        <Select value={form.type} onValueChange={(v: any) => setForm((f) => ({ ...f, type: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEBIT">Debit (expense)</SelectItem>
            <SelectItem value="CREDIT">Credit (income)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="hidden md:block" />
      <div className="md:hidden">
        <BottomSheetFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || !form.amount || !form.merchant}>
            {submitting ? "Adding…" : "Add"}
          </Button>
        </BottomSheetFooter>
      </div>
    </div>
  );
}

function useAddTransaction() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>(initialForm);
  async function submit(onDone: () => void) {
    setSubmitting(true);
    try {
      const r = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          merchant: form.merchant,
          transactionDate: new Date(`${form.date}T00:00:00+05:30`).toISOString(),
          type: form.type,
        }),
      });
      if (!r.ok) {
        toast.error("Failed to add transaction");
        return;
      }
      const j = await r.json();
      if (j.status === "duplicate") toast.info("Duplicate — logged, not inserted.");
      else toast.success("Transaction added");
      setForm(initialForm());
      window.dispatchEvent(new CustomEvent("expense-tracker:transaction-added"));
      router.refresh();
      onDone();
    } finally {
      setSubmitting(false);
    }
  }
  return { form, setForm, submitting, submit };
}

// Desktop: dialog opened by header button. Hidden on mobile.
export default function AddTransaction() {
  const [open, setOpen] = useState(false);
  const { form, setForm, submitting, submit } = useAddTransaction();

  return (
    <div className="hidden md:block">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button>Add transaction</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>
          <AddTransactionForm form={form} setForm={setForm} onSubmit={() => submit(() => setOpen(false))} onCancel={() => setOpen(false)} submitting={submitting} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => submit(() => setOpen(false))} disabled={submitting || !form.amount || !form.merchant}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Mobile: FAB that opens a bottom sheet. Hidden on desktop.
export function AddTransactionFab() {
  const [open, setOpen] = useState(false);
  const { form, setForm, submitting, submit } = useAddTransaction();

  return (
    <>
      <Fab onClick={() => setOpen(true)} label="Add transaction" />
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent title="Add transaction">
          <AddTransactionForm
            form={form}
            setForm={setForm}
            onSubmit={() => submit(() => setOpen(false))}
            onCancel={() => setOpen(false)}
            submitting={submitting}
          />
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
