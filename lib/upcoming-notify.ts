import { prisma } from "./db";
import { UpcomingStatus } from "@prisma/client";
import { sendTelegramMessage, mdv2Escape, isTelegramConfigured } from "./telegram";
import { displayMerchant } from "./merchant-display";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const SITE_URL = process.env.NEXTAUTH_URL ?? "https://exp.chockidorji.com";

function daysUntil(due: Date): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setUTCHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400e3);
}

/**
 * Build the morning digest for one user. Returns null if nothing is in the
 * next 7 days (no spam on empty days).
 */
export async function buildDigestForUser(userId: string, horizonDays = 7): Promise<string | null> {
  const horizonEnd = new Date(Date.now() + horizonDays * 86400e3);
  const rows = await prisma.upcomingPayment.findMany({
    where: { userId, status: UpcomingStatus.PENDING, dueDate: { lte: horizonEnd } },
    orderBy: { dueDate: "asc" },
  });
  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const todayCount = rows.filter((r) => daysUntil(r.dueDate) <= 0).length;

  const lines: string[] = [];
  lines.push(`📅 *Upcoming payments*`);
  const countLine =
    (todayCount > 0 ? `${todayCount} due today · ` : "") +
    `${rows.length} in next ${horizonDays}d · total ${mdv2Escape(fmt.format(total))}`;
  lines.push(countLine);
  lines.push("");

  for (const r of rows) {
    const d = daysUntil(r.dueDate);
    const whenLabel = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : dayFmt.format(r.dueDate);
    const merchant = displayMerchant(r.merchant);
    lines.push(
      `• *${mdv2Escape(whenLabel)}* · ${mdv2Escape(merchant)} · ${mdv2Escape(fmt.format(Number(r.amount)))}`
    );
  }
  lines.push("");
  lines.push(`[Manage](${SITE_URL}/upcoming)`);
  return lines.join("\n");
}

/** Returns the number of users actually notified. */
export async function sendDigestForAllUsers(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  if (!isTelegramConfigured()) {
    return { sent: 0, skipped: 0, errors: ["Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing)"] };
  }

  // Single-user deployment: one recipient in env. For multi-user we'd loop
  // users and look up per-user chat_ids from a TelegramRecipient table.
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  for (const u of users) {
    try {
      const text = await buildDigestForUser(u.id, 7);
      if (!text) {
        skipped++;
        continue;
      }
      const res = await sendTelegramMessage(text, { parseMode: "MarkdownV2" });
      if (!res.ok) {
        errors.push(`${u.email}: ${res.error}`);
      } else {
        sent++;
      }
    } catch (e) {
      errors.push(`${u.email}: ${(e as Error).message}`);
    }
  }

  return { sent, skipped, errors };
}
