/**
 * PM2 Ecosystem Config — AJKMart (VPS Production Deployment)
 *
 * Before using this:
 *   1. pnpm install
 *   2. pnpm --filter @workspace/scripts run decrypt-env   ← unlock vault
 *   3. pnpm build                                          ← build all apps
 *   4. pm2 start ecosystem.config.cjs
 *
 * Useful commands:
 *   pm2 status          → see running processes
 *   pm2 logs ajkmart    → live logs
 *   pm2 restart ajkmart → restart after update
 *   pm2 save            → persist across reboots
 *   pm2 startup         → generate systemd service
 */
"use strict";

module.exports = {
  apps: [
    {
      name: "ajkmart",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: "/home/deploy/ajkmart", // change to your clone path on VPS

      // In production the API server serves admin/vendor/rider as static files
      // (built by `pnpm build`). No separate frontend processes needed.
      instances: 1,
      exec_mode: "fork",

      // Restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      restart_delay: 3000,

      // Env — override here or use .env from vault
      env: {
        NODE_ENV: "production",
        PORT: "5000",
      },

      // Logging
      out_file: "./logs/ajkmart-out.log",
      error_file: "./logs/ajkmart-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
