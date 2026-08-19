import pool from "./db";

let migrationPromise: Promise<void> | null = null;

/** Idempotent: adds new columns to tracked_tokens if they don't exist yet. */
export async function runMigrations(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('signal-control:tracked-token-migration'))");

      await client.query(`
      ALTER TABLE tracked_tokens
        ADD COLUMN IF NOT EXISTS price_source     TEXT,
        ADD COLUMN IF NOT EXISTS contract_address TEXT,
        ADD COLUMN IF NOT EXISTS chain            TEXT,
        ADD COLUMN IF NOT EXISTS binance_pair     TEXT,
        ADD COLUMN IF NOT EXISTS pair_address     TEXT,
        ADD COLUMN IF NOT EXISTS wallet_source    TEXT
      `);
      await client.query(`
      UPDATE tracked_tokens
         SET price_source = 'coingecko'
       WHERE coingecko_id IS NOT NULL
         AND price_source IS NULL
      `);

      await client.query(`
      ALTER TABLE tracked_tokens
        ADD COLUMN IF NOT EXISTS preferred_exchange TEXT,
        ADD COLUMN IF NOT EXISTS exchange_symbol    TEXT,
        ADD COLUMN IF NOT EXISTS exchange_symbol_verified_at TIMESTAMPTZ
      `);

      await client.query(`
      UPDATE tracked_tokens
         SET exchange_symbol = NULL
       WHERE exchange_symbol_verified_at IS NULL
         AND binance_pair IS NOT NULL
         AND UPPER(exchange_symbol) = UPPER(binance_pair)
      `);

      await client.query(`
      UPDATE tracked_tokens
         SET preferred_exchange = NULL
       WHERE exchange_symbol_verified_at IS NULL
      `);

      // Refuse to weaken the old constraint unless all replacement identities
      // can be enforced. The surrounding transaction leaves the prior schema
      // untouched if legacy data needs manual reconciliation.
      await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM tracked_tokens
           WHERE chain IS NOT NULL AND contract_address IS NOT NULL
           GROUP BY lower(chain),
             CASE
               WHEN lower(chain) IN (
                 'ethereum','eth','base','arbitrum','arbitrum-one','optimism',
                 'optimistic-ethereum','polygon','polygon-pos','matic','bsc','bnb',
                 'binance-smart-chain','avalanche','avax','fantom','ftm','cronos',
                 'cro','gnosis','xdai','zksync','linea','mantle','scroll','blast'
               ) THEN lower(contract_address)
               ELSE contract_address
             END
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Duplicate tracked-token chain/contract identities require reconciliation';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM tracked_tokens
           WHERE coingecko_id IS NOT NULL
             AND (contract_address IS NULL OR chain IS NULL)
           GROUP BY lower(coingecko_id)
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Duplicate CoinGecko-only tracked-token identities require reconciliation';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM tracked_tokens
           WHERE contract_address IS NULL AND coingecko_id IS NULL
           GROUP BY symbol
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Duplicate symbol-only tracked-token identities require reconciliation';
        END IF;
      END
      $$;
      `);

      await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'tracked_tokens_symbol_key'
             AND conrelid = 'tracked_tokens'::regclass
        ) THEN
          ALTER TABLE tracked_tokens DROP CONSTRAINT tracked_tokens_symbol_key;
        END IF;
      EXCEPTION WHEN undefined_table THEN NULL;
      END
      $$
      `);

      await client.query("DROP INDEX IF EXISTS uidx_tracked_tokens_contract");
      await client.query("DROP INDEX IF EXISTS uidx_tracked_tokens_coingecko");
      await client.query("DROP INDEX IF EXISTS uidx_tracked_tokens_coingecko_only");
      await client.query("DROP INDEX IF EXISTS uidx_tracked_tokens_symbol_only");

      await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_tracked_tokens_contract
        ON tracked_tokens (
          lower(chain),
          (
            CASE
              WHEN lower(chain) IN (
                'ethereum','eth','base','arbitrum','arbitrum-one','optimism',
                'optimistic-ethereum','polygon','polygon-pos','matic','bsc','bnb',
                'binance-smart-chain','avalanche','avax','fantom','ftm','cronos',
                'cro','gnosis','xdai','zksync','linea','mantle','scroll','blast'
              ) THEN lower(contract_address)
              ELSE contract_address
            END
          )
        )
       WHERE contract_address IS NOT NULL AND chain IS NOT NULL
      `);

      await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_tracked_tokens_coingecko_only
        ON tracked_tokens (lower(coingecko_id))
       WHERE coingecko_id IS NOT NULL
         AND (contract_address IS NULL OR chain IS NULL)
      `);

      await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_tracked_tokens_symbol_only
        ON tracked_tokens (symbol)
       WHERE contract_address IS NULL AND coingecko_id IS NULL
      `);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })();

  try {
    await migrationPromise;
  } catch (err) {
    console.error("db-migrate:", err);
    migrationPromise = null;
    throw err;
  }
}
