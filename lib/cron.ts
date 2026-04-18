import cron from "node-cron";
import { syncAllUsers } from "./gmail-sync";

let registered = false;

export function registerCronJobs() {
  if (registered) return;
  if (process.env.CRON_DISABLED === "1") { console.log("[cron] disabled via CRON_DISABLED=1"); return; }
  registered = true;
  cron.schedule("*/5 * * * *", async () => {
    const start = Date.now();
    try {
      const results = await syncAllUsers();
      const totals = results.reduce(
        (a, r) => ({ inserted: a.inserted + r.inserted, duplicates: a.duplicates + r.duplicates, errors: a.errors + r.errors.length }),
        { inserted: 0, duplicates: 0, errors: 0 },
      );
      console.log(`[cron] gmail sync: users=${results.length} inserted=${totals.inserted} dup=${totals.duplicates} errors=${totals.errors} ms=${Date.now() - start}`);
    } catch (e) {
      console.error("[cron] gmail sync failed:", e);
    }
  });
  console.log("[cron] registered: gmail sync every 5 minutes");
}
