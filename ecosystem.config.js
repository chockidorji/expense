/**
 * pm2 ecosystem for the Hostinger VPS deploy.
 *
 * Two processes:
 *   expense-tracker-web   Next.js server (front-end + API routes)
 *   expense-tracker-cron  standalone Node process running scripts/run-cron.ts
 *
 * node-cron is kept OUT of the Next.js bundle because googleapis has Node-only
 * transitive deps (worker_threads, node:crypto) that Next's webpack can't
 * resolve when pulled in via the instrumentation hook. Running cron as its own
 * process is also the right pattern — separate lifecycle, separate logs, no
 * coupling to HTTP request handling.
 */
module.exports = {
  apps: [
    {
      name: "expense-tracker-web",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: "3006" },
      max_memory_restart: "512M",
      error_file: "/var/log/expense-tracker/web.err.log",
      out_file: "/var/log/expense-tracker/web.out.log",
      time: true,
    },
    {
      name: "expense-tracker-cron",
      // tsx is a shell wrapper; running it via Node (pm2's default) crashes
      // with a syntax error. Run the ESM CLI directly with node instead.
      script: "scripts/run-cron.ts",
      interpreter: "node",
      interpreter_args: "--import=tsx/esm",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "256M",
      error_file: "/var/log/expense-tracker/cron.err.log",
      out_file: "/var/log/expense-tracker/cron.out.log",
      time: true,
      autorestart: true,
    },
  ],
};
