import type { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { buildPgPoolConfig } from "@workspace/db/connection-url";
import { logger } from "./logger.js";

const nodeEnv = process.env.NODE_ENV ?? "";
const isProduction = ["production", "staging"].includes(nodeEnv);
const devMockMode = !process.env.VAULT_UNLOCKED && !isProduction;

let db: any;
let pool: Pool | undefined;

if (devMockMode) {
  logger.warn("[DEV MODE] Running without vault — using local SQLite mock database.");
  const { drizzle: drizzleSqlite } = await import("drizzle-orm/better-sqlite3");
  const BetterSqlite3 = (await import("better-sqlite3")).default as any;
  const sqlite = new BetterSqlite3("dev.db");
  db = drizzleSqlite(sqlite, { schema });
  pool = undefined;
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.fatal("❌ DATABASE_URL not set");
    process.exit(1);
  }
  logger.info({ urlLength: databaseUrl.length }, "✅ DB URL loaded");

  const { Pool } = await import("pg");
  pool = new Pool({
    ...buildPgPoolConfig(databaseUrl),
    max: parseInt(process.env.DB_POOL_MAX ?? "10"),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  db = drizzlePg(pool, { schema });
}

export { db, pool };
