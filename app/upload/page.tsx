"use client";
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import MobileHeader from "@/components/mobile/mobile-header";

type Preview = {
  token: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  skipRows: number;
  detectedSkip: number;
  totalRowsBeforeSkip: number;
};

type AmountMode = "single" | "dual";

type Mapping = {
  date: string;
  merchant: string;
  // single-mode
  amount: string;
  type: string; // "__none__" means no explicit type column
  // dual-mode
  withdrawalAmount: string;
  depositAmount: string;
  account: string; // "__none__" means none
};

const emptyMapping: Mapping = {
  date: "",
  merchant: "",
  amount: "",
  type: "__none__",
  withdrawalAmount: "",
  depositAmount: "",
  account: "__none__",
};

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipInput, setSkipInput] = useState<string>("");
  const [amountMode, setAmountMode] = useState<AmountMode>("dual");
  const [mapping, setMapping] = useState<Mapping>(emptyMapping);
  const [defaultType, setDefaultType] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [importing, setImporting] = useState(false);
  const [reloadingPreview, setReloadingPreview] = useState(false);
  const [result, setResult] = useState<{ inserted: number; duplicates: number; errors: { row: number; reason: string }[] } | null>(null);

  async function uploadWithSkip(file: File, skip?: number) {
    const fd = new FormData();
    fd.append("file", file);
    if (skip !== undefined) fd.append("skipRows", String(skip));
    const r = await fetch("/api/upload/csv/preview", { method: "POST", body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast.error(j.error ?? "Preview failed");
      return null;
    }
    return (await r.json()) as Preview;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    fileRef.current = f;
    const j = await uploadWithSkip(f);
    if (!j) return;
    setPreview(j);
    setSkipInput(String(j.skipRows));
    setMapping(emptyMapping);
    setResult(null);
  }

  async function applySkip() {
    if (!fileRef.current) { toast.error("Select a file first"); return; }
    const n = Number(skipInput);
    if (!Number.isFinite(n) || n < 0) { toast.error("Skip rows must be a non-negative integer"); return; }
    setReloadingPreview(true);
    const j = await uploadWithSkip(fileRef.current, n);
    setReloadingPreview(false);
    if (!j) return;
    setPreview(j);
    setMapping(emptyMapping);
    setResult(null);
  }

  function mappingReady(): string | null {
    if (!mapping.date) return "Map the date column";
    if (!mapping.merchant) return "Map the merchant column";
    if (amountMode === "single") {
      if (!mapping.amount) return "Map the amount column";
    } else {
      if (!mapping.withdrawalAmount && !mapping.depositAmount) return "Map at least one of withdrawal / deposit amount";
    }
    return null;
  }

  async function onImport() {
    if (!preview) return;
    const err = mappingReady();
    if (err) { toast.error(err); return; }

    const body = {
      token: preview.token,
      mapping: {
        date: mapping.date,
        merchant: mapping.merchant,
        account: mapping.account === "__none__" ? undefined : mapping.account,
        ...(amountMode === "single"
          ? {
              amount: mapping.amount,
              type: mapping.type === "__none__" ? undefined : mapping.type,
            }
          : {
              withdrawalAmount: mapping.withdrawalAmount || undefined,
              depositAmount: mapping.depositAmount || undefined,
            }),
      },
      defaultType,
    };

    setImporting(true);
    const r = await fetch("/api/upload/csv/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setImporting(false);
    if (!r.ok) { toast.error("Import failed"); return; }
    setResult(await r.json());
    toast.success("Import complete");
    window.dispatchEvent(new CustomEvent("expense-tracker:transaction-added"));
  }

  return (
    <>
      <MobileHeader title="Import statement" />
      <main className="mx-auto max-w-4xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-6">
        <Link
          href="/settings"
          className="md:hidden inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Settings
        </Link>
      <h1 className="hidden md:block text-2xl font-semibold">Import statement</h1>

      <Card>
        <CardHeader><CardTitle>1 · Choose file</CardTitle></CardHeader>
        <CardContent>
          <Input type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onFile} />
          <p className="text-xs text-muted-foreground mt-1">CSV or Excel (.xlsx / .xls / .xlsm). Max 10 MB.</p>
          {preview && <p className="text-sm text-muted-foreground mt-2">{preview.rowCount} rows detected (auto-skipped {preview.skipRows} banner row{preview.skipRows === 1 ? "" : "s"} of {preview.totalRowsBeforeSkip}).</p>}
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card>
            <CardHeader><CardTitle>2 · Header row</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                If the column names below look wrong (e.g. "1", "2", "HDFC BANK Ltd..."), banner-row detection missed the header. Change the number to skip and re-preview.
              </p>
              <div className="flex items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="skipRows">Skip first N rows</Label>
                  <Input
                    id="skipRows"
                    type="number"
                    min={0}
                    value={skipInput}
                    onChange={e => setSkipInput(e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button variant="outline" disabled={reloadingPreview} onClick={applySkip}>
                  {reloadingPreview ? "Re-parsing..." : "Apply"}
                </Button>
                <span className="text-xs text-muted-foreground">Auto-detected: {preview.detectedSkip}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Row {preview.skipRows + 1} of the original file is being used as the header.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3 · Map columns</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5 max-w-xs">
                <Label>Amount column layout</Label>
                <Select value={amountMode} onValueChange={(v: any) => setAmountMode((v ?? "dual") as AmountMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dual">Two columns — Withdrawal + Deposit (most Indian banks)</SelectItem>
                    <SelectItem value="single">Single column with optional Type</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Date *</Label>
                  <Select value={mapping.date} onValueChange={v => setMapping(m => ({ ...m, date: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select date column" /></SelectTrigger>
                    <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Merchant / Narration *</Label>
                  <Select value={mapping.merchant} onValueChange={v => setMapping(m => ({ ...m, merchant: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select merchant column" /></SelectTrigger>
                    <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {amountMode === "single" ? (
                  <>
                    <div className="grid gap-1.5">
                      <Label>Amount *</Label>
                      <Select value={mapping.amount} onValueChange={v => setMapping(m => ({ ...m, amount: v ?? "" }))}>
                        <SelectTrigger><SelectValue placeholder="Select amount column" /></SelectTrigger>
                        <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Type column (optional)</Label>
                      <Select value={mapping.type} onValueChange={v => setMapping(m => ({ ...m, type: v ?? "__none__" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None — use default</SelectItem>
                          {preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-1.5">
                      <Label>Withdrawal amount *</Label>
                      <Select value={mapping.withdrawalAmount} onValueChange={v => setMapping(m => ({ ...m, withdrawalAmount: v ?? "" }))}>
                        <SelectTrigger><SelectValue placeholder="Select withdrawal column" /></SelectTrigger>
                        <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Deposit amount *</Label>
                      <Select value={mapping.depositAmount} onValueChange={v => setMapping(m => ({ ...m, depositAmount: v ?? "" }))}>
                        <SelectTrigger><SelectValue placeholder="Select deposit column" /></SelectTrigger>
                        <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="grid gap-1.5">
                  <Label>Account column (optional)</Label>
                  <Select value={mapping.account} onValueChange={v => setMapping(m => ({ ...m, account: v ?? "__none__" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {amountMode === "single" && (
                  <div className="grid gap-1.5">
                    <Label>Default type (if no type column)</Label>
                    <Select value={defaultType} onValueChange={(v: any) => setDefaultType((v ?? "DEBIT") as "DEBIT" | "CREDIT")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEBIT">Debit</SelectItem>
                        <SelectItem value="CREDIT">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {amountMode === "dual" && (
                <p className="text-xs text-muted-foreground">
                  Per row: if withdrawal &gt; 0 the transaction is a DEBIT; otherwise if deposit &gt; 0 it's a CREDIT; otherwise the row is skipped.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>4 · Preview (first 5 rows)</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>{preview.headers.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sampleRows.map((r, i) => (
                      <TableRow key={i}>
                        {preview.headers.map(h => <TableCell key={h}>{r[h]}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button className="mt-4 w-full md:w-auto min-h-[44px]" disabled={importing} onClick={onImport}>
                {importing ? "Importing..." : `Import ${preview.rowCount} rows`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p>Inserted: <b>{result.inserted}</b></p>
            <p>Duplicates skipped (logged): <b>{result.duplicates}</b></p>
            <p>Errors: <b>{result.errors.length}</b></p>
            {result.errors.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm">Error details</summary>
                <ul className="text-xs space-y-1 mt-2">
                  {result.errors.slice(0, 50).map((e, i) => <li key={i}>row {e.row}: {e.reason}</li>)}
                </ul>
              </details>
            )}
            <Button variant="outline" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
          </CardContent>
        </Card>
      )}
      </main>
    </>
  );
}
