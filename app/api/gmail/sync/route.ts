import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { syncUserGmail } from "@/lib/gmail-sync";

export async function POST() {
  try {
    const { userId } = await requireUser();
    const result = await syncUserGmail(userId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
