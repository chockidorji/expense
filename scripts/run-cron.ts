/* eslint-disable no-console */
// Standalone cron worker. Runs node-cron in its own Node process so the Next.js
// web server bundle stays free of the googleapis/node-cron tree (which doesn't
// play well with Next's webpack layer).
//
// Run in dev:   pnpm tsx --env-file=.env.local --env-file=.env scripts/run-cron.ts
// Run in prod:  pm2 entry in ecosystem.config.js points at this file via tsx.
import cron from "node-cron";
import { syncAllUsers } from "../lib/gmail-sync";
import { sendDigestForAllUsers } from "../lib/upcoming-notify";
import { sendTelegramMessage, mdv2Escape, isTelegramConfigured } from "../lib/telegram";

console.log("[cron-worker] booting");

// Sync-health alert state. The cron previously logged `users=0 inserted=0`
// silently when auth broke; the user had no idea until they checked the
// dashboard days later. Track consecutive failure ticks and push a Telegram
// ping at the transition + a recovery ping when it comes back.
let unhealthyTicks = 0;
let alertedForCurrentOutage = false;
const UNHEALTHY_THRESHOLD = 2; // ~10 minutes (2 × 5-min ticks)

async function pingTelegramSafe(text: string, disableNotification: boolean): Promise<void> {
  if (!isTelegramConfigured()) return;
  try {
    await sendTelegramMessage(text, { parseMode: "MarkdownV2", disableNotification });
  } catch (e) {
    console.error("[cron-worker] telegram alert failed:", e);
  }
}

cron.schedule("*/5 * * * *", async () => {
  const start = Date.now();
  try {
    const results = await syncAllUsers();
    const totals = results.reduce(
      (a, r) => ({ inserted: a.inserted + r.inserted, duplicates: a.duplicates + r.duplicates, errors: a.errors + r.errors.length }),
      { inserted: 0, duplicates: 0, errors: 0 },
    );
    console.log(`[cron-worker] gmail sync: users=${results.length} inserted=${totals.inserted} dup=${totals.duplicates} errors=${totals.errors} ms=${Date.now() - start}`);

    // Health-state tracking. `users=0` means syncAllUsers couldn't find any
    // user with a working Gmail credential — that's our silent-failure signal.
    if (results.length === 0) {
      unhealthyTicks++;
      if (unhealthyTicks >= UNHEALTHY_THRESHOLD && !alertedForCurrentOutage) {
        const reauthUrl = (process.env.NEXTAUTH_URL ?? "https://exp.chockidorji.com") + "/api/auth/signin/google";
        await pingTelegramSafe(
          [
            "🚨 *Expense Tracker sync stopped*",
            "",
            `${mdv2Escape(`No users with working Gmail auth for ${unhealthyTicks * 5}+ minutes\\.`)}`,
            "",
            `[Reconnect now](${reauthUrl})`,
          ].join("\n"),
          /* disableNotification */ false,
        );
        alertedForCurrentOutage = true;
      }
    } else {
      if (alertedForCurrentOutage) {
        await pingTelegramSafe(
          `✅ *Expense Tracker sync recovered* \\(${results[0]?.inserted ?? 0} inserted this tick\\)`,
          /* disableNotification */ true,
        );
      }
      unhealthyTicks = 0;
      alertedForCurrentOutage = false;
    }
  } catch (e) {
    console.error("[cron-worker] gmail sync failed:", e);
  }
});

// Daily Telegram digest at 8:00 Asia/Kolkata (IST = UTC+5:30, so 02:30 UTC).
cron.schedule(
  "30 2 * * *",
  async () => {
    const start = Date.now();
    try {
      const { sent, skipped, errors } = await sendDigestForAllUsers();
      console.log(
        `[cron-worker] telegram digest: sent=${sent} skipped=${skipped} errors=${errors.length} ms=${Date.now() - start}${
          errors.length ? " · " + errors.join("; ") : ""
        }`
      );
    } catch (e) {
      console.error("[cron-worker] telegram digest failed:", e);
    }
  },
  { timezone: "UTC" } // explicit — handles DST-free UTC cleanly
);

console.log("[cron-worker] registered: gmail sync every 5 min, telegram digest 08:00 IST");

// Keep the process alive.
process.on("SIGINT", () => { console.log("[cron-worker] SIGINT — shutting down"); process.exit(0); });
process.on("SIGTERM", () => { console.log("[cron-worker] SIGTERM — shutting down"); process.exit(0); });
