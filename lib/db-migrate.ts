import pool from "./db";

let ran = false;

/** Idempotent: adds new columns to tracked_tokens if they don't exist yet. */
export async function runMigrations(): Promise<void> {
  if (ran) return;
  ran = true;
  try {
    await pool.query(`
      ALTER TABLE tracked_tokens
        ADD COLUMN IF NOT EXISTS price_source     TEXT,
        ADD COLUMN IF NOT EXISTS contract_address TEXT,
        ADD COLUMN IF NOT EXISTS chain            TEXT,
        ADD COLUMN IF NOT EXISTS binance_pair     TEXT,
        ADD COLUMN IF NOT EXISTS pair_address     TEXT,
        ADD COLUMN IF NOT EXISTS wallet_source    TEXT
    `);
    await pool.query(`
      UPDATE tracked_tokens
         SET price_source = 'coingecko'
       WHERE coingecko_id IS NOT NULL
         AND price_source IS NULL
    `);
  } catch (err) {
    console.error("db-migrate:", err);
    ran = false; // allow retry on next request
  }
}
