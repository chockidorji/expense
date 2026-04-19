import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { scanUpcomingFromGmail } from "@/lib/upcoming-email";
import { notifyNewEmailUpcoming } from "@/lib/upcoming-notify";

/** Manual trigger: scan Gmail for upcoming-payment emails and send Telegram if anything new. */
export async function POST() {
  try {
    const { userId } = await requireUser();
    const scan = await scanUpcomingFromGmail(userId);
    let notified = false;
    if (scan.newMatches.length > 0) {
      const r = await notifyNewEmailUpcoming(userId, scan.newMatches);
      notified = r.ok;
    }
    return NextResponse.json({
      ok: true,
      fetched: scan.fetched,
      matched: scan.matched,
      inserted: scan.inserted,
      skipped: scan.skipped,
      notified,
      errors: scan.errors,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
