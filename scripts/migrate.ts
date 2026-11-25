import "./local-env.js";
import { readFile } from "node:fs/promises";
import { requireSetting } from "../src/config.js";
import { Database } from "../src/db.js";
import { logError } from "../src/errors.js";

async function migrate(): Promise<void> {
  const db = new Database(requireSetting("DATABASE_URL"));
  try {
    const schema = await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8");
    await db.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('card_and_tile_schema'))");
      await client.query(schema);
    });
    console.log("Database schema is ready.");
  } finally {
    await db.pool.end();
  }
}

migrate().catch((error) => {
  logError("Database migration failed", error);
  process.exitCode = 1;
});
