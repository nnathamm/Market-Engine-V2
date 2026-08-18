import pool from "@/lib/db";

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS wallet_portfolio (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await pool.query(ENSURE_TABLE_SQL);
  tableReady = true;
}

export class PgWalletStore {
  async list(): Promise<Record<string, unknown>[]> {
    await ensureTable();
    const { rows } = await pool.query(
      "SELECT data FROM wallet_portfolio ORDER BY (data->>'createdAt') DESC NULLS LAST"
    );
    return rows.map((r) => r.data);
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    await ensureTable();
    const { rows } = await pool.query(
      "SELECT data FROM wallet_portfolio WHERE id = $1",
      [id]
    );
    return rows[0]?.data ?? null;
  }

  async upsert(wallet: Record<string, unknown>): Promise<Record<string, unknown>> {
    await ensureTable();
    await pool.query(
      `INSERT INTO wallet_portfolio (id, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [wallet.id, JSON.stringify(wallet)]
    );
    return wallet;
  }

  async remove(id: string): Promise<boolean> {
    await ensureTable();
    const { rowCount } = await pool.query(
      "DELETE FROM wallet_portfolio WHERE id = $1",
      [id]
    );
    return (rowCount ?? 0) > 0;
  }
}
