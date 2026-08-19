import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;

test("anonymous wallet deletes are rejected without exposing tracked data", { timeout: 30_000 }, async (t) => {
  if (!process.env.DATABASE_URL || !process.env.REPLIT_DEV_DOMAIN) {
    t.skip("Requires the development database and running Replit workflow.");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}:5000`;
  const suffix = `${process.pid}-${Date.now()}`;
  const walletA = `__cleanup-concurrent-a-${suffix}`;
  const walletB = `__cleanup-concurrent-b-${suffix}`;
  const contract = `0x${"d".repeat(40)}`;
  const symbol = "XCON59";
  const holding = {
    symbol,
    name: symbol,
    network: "eth-mainnet",
    contractAddress: contract,
    balance: "1",
    usdValue: 1,
    price: 1,
    change24h: 0,
  };
  const wallet = (id) => ({
    id,
    address: id,
    label: id,
    networks: ["eth-mainnet"],
    holdings: [holding],
    status: "ACTIVE",
    totalUsdValue: 1,
    lastUpdated: new Date().toISOString(),
  });

  try {
    await pool.query(
      "INSERT INTO wallet_portfolio (id, data) VALUES ($1, $2::jsonb), ($3, $4::jsonb)",
      [walletA, JSON.stringify(wallet(walletA)), walletB, JSON.stringify(wallet(walletB))],
    );
    await pool.query(
      `INSERT INTO tracked_tokens
         (symbol, chain, contract_address, wallet_source)
       VALUES ($1, 'ethereum', $2, $3)`,
      [symbol, contract, walletA],
    );

    const remove = (id) => fetch(`${baseUrl}/api/wallet-portfolio/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const [responseA, responseB] = await Promise.all([remove(walletA), remove(walletB)]);
    assert.equal(responseA.status, 401);
    assert.equal(responseB.status, 401);

    const { rows: tokenRows } = await pool.query(
      "SELECT id FROM tracked_tokens WHERE symbol = $1 AND contract_address = $2",
      [symbol, contract],
    );
    assert.equal(tokenRows.length, 1);

    const { rows: walletRows } = await pool.query(
      "SELECT id FROM wallet_portfolio WHERE id IN ($1, $2)",
      [walletA, walletB],
    );
    assert.equal(walletRows.length, 2);
  } finally {
    await pool.query(
      "DELETE FROM tracked_tokens WHERE symbol = $1 AND contract_address = $2",
      [symbol, contract],
    );
    await pool.query(
      "DELETE FROM wallet_portfolio WHERE id IN ($1, $2)",
      [walletA, walletB],
    );
    await pool.end();
  }
});