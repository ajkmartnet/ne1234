import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@workspace/db/schema";
import { buildPgPoolConfig } from "@workspace/db/connection-url";
import { logger } from "./logger.js";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

const databaseUrl = process.env.DATABASE_URL;
const isProduction = ["production", "staging"].includes(process.env.NODE_ENV ?? "");
const isDevMock = !process.env.VAULT_UNLOCKED && !isProduction && !databaseUrl;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let pool: Pool | undefined;

if (isDevMock) {
  logger.warn(
    "\x1b[33m[DEV MODE]\x1b[0m Running without vault — using local SQLite mock database.\n" +
    "          Run `pnpm --filter @workspace/scripts run decrypt-env` to unlock the full vault.\n" +
    "          Limited features available without a real PostgreSQL database.\n"
  );
  try {
    const BetterSqlite = _require("better-sqlite3");
    const { drizzle: drizzleSqlite } = _require("drizzle-orm/better-sqlite3");
    const sqlite = new BetterSqlite("./dev.db");
    db = drizzleSqlite(sqlite, { schema });
    logger.info("[DEV MODE] SQLite mock database initialised at ./dev.db");
  } catch (e) {
    logger.warn({ err: e }, "[DEV MODE] better-sqlite3 not available — db will be a no-op stub. Some routes may error.");
    db = {};
  }
} else {
  if (!databaseUrl) {
    logger.fatal("❌ DATABASE_URL not set");
    process.exit(1);
  }
  logger.info({ urlLength: databaseUrl.length }, "✅ DB URL loaded");

  pool = new Pool({
    ...buildPgPoolConfig(databaseUrl),
    max: parseInt(process.env.DB_POOL_MAX ?? "10"),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  db = drizzle(pool, { schema });
}

export { db, pool };
