import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { buildDigestForUser } from "@/lib/upcoming-notify";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/telegram";

/**
 * Manually trigger the daily digest for the signed-in user. Useful to sanity-
 * check Telegram wiring before tomorrow's scheduled run.
 */
export async function POST() {
  try {
    const { userId } = await requireUser();
    if (!isTelegramConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID." },
        { status: 400 }
      );
    }
    const text = await buildDigestForUser(userId, 7);
    if (!text) {
      return NextResponse.json({ ok: true, sent: false, reason: "No upcoming payments in next 7 days" });
    }
    const res = await sendTelegramMessage(text, { parseMode: "MarkdownV2" });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
