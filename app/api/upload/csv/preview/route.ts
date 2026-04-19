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

/** Convert an Excel workbook buffer to CSV text using the first non-empty sheet. */
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

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const csvText = isExcel(file.name, file.type) ? excelBufferToCsv(buf) : buf.toString("utf8");
    if (!csvText.trim()) {
      return NextResponse.json({ error: "File is empty or has no usable sheet" }, { status: 400 });
    }

    const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
    if (result.errors.length > 0 && result.data.length === 0) {
      return NextResponse.json({ error: "Unable to parse spreadsheet", details: result.errors.slice(0, 3) }, { status: 400 });
    }
    const headers = result.meta.fields ?? [];

    // Always stash as CSV so the import endpoint only has to know one format.
    const token = await stashCsv(Buffer.from(csvText, "utf8"));
    return NextResponse.json({
      token,
      headers,
      sampleRows: result.data.slice(0, 5),
      rowCount: result.data.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
