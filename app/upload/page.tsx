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

type Preview = {
  token: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  skipRows: number;
  detectedSkip: number;
  totalRowsBeforeSkip: number;
};

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipInput, setSkipInput] = useState<string>("");
  const [mapping, setMapping] = useState({ date: "", amount: "", merchant: "", type: "__none__", account: "__none__" });
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
    setMapping({ date: "", amount: "", merchant: "", type: "__none__", account: "__none__" });
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
    setMapping({ date: "", amount: "", merchant: "", type: "__none__", account: "__none__" });
    setResult(null);
  }

  async function onImport() {
    if (!preview) return;
    if (!mapping.date || !mapping.amount || !mapping.merchant) {
      toast.error("Map date, amount, merchant");
      return;
    }
    setImporting(true);
    const r = await fetch("/api/upload/csv/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: preview.token,
        mapping: {
          date: mapping.date,
          amount: mapping.amount,
          merchant: mapping.merchant,
          type: mapping.type === "__none__" ? undefined : mapping.type,
          account: mapping.account === "__none__" ? undefined : mapping.account,
        },
        defaultType,
      }),
    });
    setImporting(false);
    if (!r.ok) { toast.error("Import failed"); return; }
    setResult(await r.json());
    toast.success("Import complete");
    window.dispatchEvent(new CustomEvent("expense-tracker:transaction-added"));
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Import statement</h1>

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
                If the column names below look wrong (e.g. "1", "2", "HDFC BANK Ltd..."), the banner-row detection missed your header. Change the number of rows to skip and re-preview.
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
              <p className="text-xs text-muted-foreground mt-2">Row {preview.skipRows + 1} of the original file is being used as the header. Rows above it are ignored.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3 · Map columns</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(["date", "amount", "merchant"] as const).map(k => (
                <div key={k} className="grid gap-1.5">
                  <Label className="capitalize">{k} *</Label>
                  <Select value={mapping[k]} onValueChange={v => setMapping(m => ({ ...m, [k]: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder={`Select ${k} column`} /></SelectTrigger>
                    <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
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
              <Button className="mt-4" disabled={importing} onClick={onImport}>
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
  );
}
