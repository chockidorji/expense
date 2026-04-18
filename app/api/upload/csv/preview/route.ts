import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { requireUser } from "@/lib/session";
import { stashCsv } from "@/lib/upload-store";

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const text = buf.toString("utf8");
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (result.errors.length > 0 && result.data.length === 0) {
      return NextResponse.json({ error: "Unable to parse CSV", details: result.errors.slice(0, 3) }, { status: 400 });
    }
    const headers = result.meta.fields ?? [];
    const token = await stashCsv(buf);
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
