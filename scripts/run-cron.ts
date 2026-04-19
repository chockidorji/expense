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

console.log("[cron-worker] booting");

cron.schedule("*/5 * * * *", async () => {
  const start = Date.now();
  try {
    const results = await syncAllUsers();
    const totals = results.reduce(
      (a, r) => ({ inserted: a.inserted + r.inserted, duplicates: a.duplicates + r.duplicates, errors: a.errors + r.errors.length }),
      { inserted: 0, duplicates: 0, errors: 0 },
    );
    console.log(`[cron-worker] gmail sync: users=${results.length} inserted=${totals.inserted} dup=${totals.duplicates} errors=${totals.errors} ms=${Date.now() - start}`);
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
