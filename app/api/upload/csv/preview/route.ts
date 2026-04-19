import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/session";
import { stashCsv } from "@/lib/upload-store";

function isExcel(fileName: string, mimeType: string): boolean {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) return true;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return true;
  return false;
}

function excelBufferToCsv(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer", raw: false });
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim().length > 0) return csv;
  }
  return "";
}

const HEADER_HINTS = [
  "date", "narration", "description", "particulars", "transaction",
  "amount", "debit", "credit", "withdrawal", "deposit", "value",
  "balance", "ref", "reference", "chq", "cheque",
];

/**
 * Auto-detect the header row. Indian bank statements commonly have 5–20 banner
 * rows before the real column headers. We scan the first ~30 rows and pick the
 * first one that (a) has ≥4 non-empty cells and (b) contains ≥2 common banking
 * header keywords case-insensitively.
 */
function detectHeaderRow(allRows: string[][]): number {
  const limit = Math.min(allRows.length, 30);
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const row = allRows[i] ?? [];
    const nonEmpty = row.filter(c => (c ?? "").trim().length > 0).length;
    if (nonEmpty < 4) continue;
    const joined = row.join(" ").toLowerCase();
    const hits = HEADER_HINTS.filter(h => joined.includes(h)).length;
    if (hits >= 2 && hits > bestScore) {
      bestScore = hits;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

    const skipParam = Number(form.get("skipRows") ?? NaN);
    const userSkip = Number.isFinite(skipParam) && skipParam >= 0 ? Math.floor(skipParam) : null;

    const buf = Buffer.from(await file.arrayBuffer());
    const csvText = isExcel(file.name, file.type) ? excelBufferToCsv(buf) : buf.toString("utf8");
    if (!csvText.trim()) {
      return NextResponse.json({ error: "File is empty or has no usable sheet" }, { status: 400 });
    }

    // First pass: parse without header to let us auto-detect / apply skipRows.
    const raw = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
    const allRows = (raw.data as string[][]).filter(Array.isArray);
    if (allRows.length === 0) {
      return NextResponse.json({ error: "Spreadsheet has no rows" }, { status: 400 });
    }

    const detectedSkip = detectHeaderRow(allRows);
    const skipRows = userSkip ?? detectedSkip;

    if (skipRows >= allRows.length) {
      return NextResponse.json({ error: `skipRows (${skipRows}) is past the end of the file` }, { status: 400 });
    }

    // Rebuild a CSV with the banner rows stripped so downstream import uses the right headers.
    const trimmedRows = allRows.slice(skipRows);
    const trimmedCsv = Papa.unparse(trimmedRows, { newline: "\n" });

    // Now re-parse as header-mode to get sampleRows keyed by column name.
    const result = Papa.parse<Record<string, string>>(trimmedCsv, { header: true, skipEmptyLines: true });
    if (result.errors.length > 0 && result.data.length === 0) {
      return NextResponse.json({ error: "Unable to parse spreadsheet after skipping banner rows", details: result.errors.slice(0, 3) }, { status: 400 });
    }
    const headers = result.meta.fields ?? [];

    const token = await stashCsv(Buffer.from(trimmedCsv, "utf8"));
    return NextResponse.json({
      token,
      headers,
      sampleRows: result.data.slice(0, 5),
      rowCount: result.data.length,
      skipRows,
      detectedSkip,
      totalRowsBeforeSkip: allRows.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
