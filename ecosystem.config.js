module.exports = {
  apps: [
    {
      name: "expense-tracker",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,                // node-cron is in-process; do NOT scale >1
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      error_file: "/var/log/expense-tracker/err.log",
      out_file: "/var/log/expense-tracker/out.log",
      time: true,
    },
  ],
};
