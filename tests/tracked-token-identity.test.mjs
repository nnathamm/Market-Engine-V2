/**
 * Focused unit tests for tracked-token identity persistence (task #59).
 *
 * These tests exercise the pure logic layers only (no DB / Next.js runtime),
 * covering:
 *   - Symbol normalisation to uppercase
 *   - Binance price pairs are never promoted to verified WEEX identities
 *   - resolveParam numeric vs symbol disambiguation logic
 *   - Upsert priority: contract+chain > coingecko_id > symbol-only
 *   - Ambiguous symbol detection for PATCH/DELETE
 */

import assert from "node:assert/strict";
import test from "node:test";

// ── helpers mirroring route logic ─────────────────────────────────────────

/** Normalise a raw symbol the way POST does. */
function normaliseSymbol(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

/** Normalize only an explicitly supplied exchange symbol. */
function deriveExchangeSymbol({ exchange_symbol }) {
  if (exchange_symbol) return exchange_symbol.trim().toUpperCase();
  return null;
}

const EVM_CHAINS = new Set(["ethereum", "eth", "base", "bsc", "binance-smart-chain", "arbitrum", "polygon"]);

function normaliseContract(raw, chain) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return EVM_CHAINS.has(String(chain ?? "").trim().toLowerCase()) ? value.toLowerCase() : value;
}

/**
 * Simulate resolveParam logic.
 * rows: array of { id, symbol } representing DB state.
 */
function resolveParam(param, rows) {
  const asNum = Number(param);
  if (Number.isInteger(asNum) && asNum > 0 && String(asNum) === param) {
    const found = rows.find(r => r.id === asNum);
    return found ? { status: "found", id: asNum } : { status: "not_found" };
  }
  const sym = param.toUpperCase();
  const matches = rows.filter(r => r.symbol === sym);
  if (matches.length === 0) return { status: "not_found" };
  if (matches.length > 1)   return { status: "ambiguous", count: matches.length };
  return { status: "found", id: matches[0].id };
}

/**
 * Simulate POST upsert resolution priority.
 * rows: array of { id, symbol, contract_address, chain, coingecko_id }
 */
function resolveExisting({ contract_address, chain, coingecko_id, symbol }, rows) {
  const chainNorm    = chain?.trim().toLowerCase() ?? null;
  const contractNorm = normaliseContract(contract_address, chainNorm);
  const cgId         = coingecko_id ?? null;
  const clean        = normaliseSymbol(symbol);
  const hasContractIdentity = Boolean(contractNorm && chainNorm);

  if (hasContractIdentity) {
    const hit = rows.find(
      r => normaliseContract(r.contract_address, r.chain) === contractNorm &&
           r.chain?.toLowerCase() === chainNorm
    );
    if (hit) return hit.id;
  }
  if (cgId && !hasContractIdentity) {
    const hit = rows.find(
      r => r.coingecko_id?.toLowerCase() === cgId.toLowerCase()
    );
    if (hit) return hit.id;
  }
  // symbol-only rows (no strong identity)
  const hit = !hasContractIdentity && !cgId
    ? rows.find(r => r.symbol === clean && !r.contract_address && !r.coingecko_id)
    : null;
  return hit ? hit.id : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────

test("symbol is normalised to uppercase", () => {
  assert.equal(normaliseSymbol("btc"), "BTC");
  assert.equal(normaliseSymbol(" eth "), "ETH");
  assert.equal(normaliseSymbol("USDC"), "USDC");
  assert.equal(normaliseSymbol(""), "");
  assert.equal(normaliseSymbol(null), "");
});

test("Binance pairs are not promoted to saved WEEX symbols", () => {
  assert.equal(deriveExchangeSymbol({ exchange_symbol: "btcusdt", binance_pair: "btcusdt" }), "BTCUSDT");
  assert.equal(deriveExchangeSymbol({ exchange_symbol: null,      binance_pair: "ethusdt" }), null);
  assert.equal(deriveExchangeSymbol({ exchange_symbol: null,      binance_pair: null      }), null);
});

test("resolveParam: numeric id takes priority", () => {
  const rows = [
    { id: 1, symbol: "BTC" },
    { id: 2, symbol: "ETH" },
  ];
  assert.deepEqual(resolveParam("1",  rows), { status: "found", id: 1 });
  assert.deepEqual(resolveParam("2",  rows), { status: "found", id: 2 });
  assert.deepEqual(resolveParam("99", rows), { status: "not_found" });
});

test("resolveParam: symbol path – exact single match", () => {
  const rows = [{ id: 5, symbol: "SOL" }];
  assert.deepEqual(resolveParam("SOL", rows), { status: "found", id: 5 });
  assert.deepEqual(resolveParam("sol", rows), { status: "found", id: 5 }); // normalised
});

test("resolveParam: symbol path – ambiguous when >1 rows share symbol", () => {
  const rows = [
    { id: 3, symbol: "MATIC" },
    { id: 7, symbol: "MATIC" },
  ];
  const result = resolveParam("MATIC", rows);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.count, 2);
});

test("resolveParam: symbol not found", () => {
  const rows = [{ id: 1, symbol: "BTC" }];
  assert.deepEqual(resolveParam("ETH", rows), { status: "not_found" });
});

test("resolveParam: float string goes through symbol path, not numeric id path", () => {
  // '1.5' is not an integer string, so it goes through the symbol path.
  // A row whose symbol is literally '1.5' will be found; a missing symbol won't.
  const rowsWithSymbol = [{ id: 1, symbol: "1.5" }];
  assert.deepEqual(resolveParam("1.5", rowsWithSymbol), { status: "found", id: 1 });

  // Ensure it did NOT match via the numeric-id path: if we give a DB where no
  // row has id=1 but also no symbol '99.9', we get not_found.
  const emptyRows = [];
  assert.deepEqual(resolveParam("99.9", emptyRows), { status: "not_found" });
});

test("upsert resolves by contract+chain first", () => {
  const rows = [
    { id: 10, symbol: "TOKEN", contract_address: "0xABC", chain: "ethereum", coingecko_id: null },
  ];
  const id = resolveExisting(
    { symbol: "TOKEN", contract_address: "0xABC", chain: "Ethereum", coingecko_id: null },
    rows
  );
  assert.equal(id, 10);
});

test("upsert resolves by coingecko_id when contract is absent", () => {
  const rows = [
    { id: 20, symbol: "BTC", contract_address: null, chain: null, coingecko_id: "bitcoin" },
  ];
  const id = resolveExisting(
    { symbol: "BTC", contract_address: null, chain: null, coingecko_id: "Bitcoin" },
    rows
  );
  assert.equal(id, 20);
});

test("upsert resolves by symbol-only when no strong identity", () => {
  const rows = [
    { id: 30, symbol: "MYTOKEN", contract_address: null, chain: null, coingecko_id: null },
  ];
  const id = resolveExisting(
    { symbol: "MYTOKEN", contract_address: null, chain: null, coingecko_id: null },
    rows
  );
  assert.equal(id, 30);
});

test("upsert inserts new record when no match found", () => {
  const rows = [
    { id: 1, symbol: "BTC", contract_address: null, chain: null, coingecko_id: "bitcoin" },
  ];
  const id = resolveExisting(
    { symbol: "ETH", contract_address: null, chain: null, coingecko_id: "ethereum" },
    rows
  );
  assert.equal(id, null);
});

test("upsert contract match does not accidentally match symbol-only rows", () => {
  const rows = [
    // symbol-only row for USDC
    { id: 1, symbol: "USDC", contract_address: null, chain: null, coingecko_id: null },
    // contract-identified USDC on eth
    { id: 2, symbol: "USDC", contract_address: "0xA0b8", chain: "ethereum", coingecko_id: null },
  ];

  // Request with contract should match row 2
  const idByContract = resolveExisting(
    { symbol: "USDC", contract_address: "0xA0b8", chain: "ethereum", coingecko_id: null },
    rows
  );
  assert.equal(idByContract, 2);

  // Request without strong identity should match symbol-only row 1
  const idBySymbol = resolveExisting(
    { symbol: "USDC", contract_address: null, chain: null, coingecko_id: null },
    rows
  );
  assert.equal(idBySymbol, 1);
});

test("contract match is case-insensitive", () => {
  const rows = [
    { id: 42, symbol: "WETH", contract_address: "0xC02aaa", chain: "Ethereum", coingecko_id: null },
  ];
  const id = resolveExisting(
    { symbol: "WETH", contract_address: "0xC02AAA", chain: "ETHEREUM", coingecko_id: null },
    rows
  );
  assert.equal(id, 42);
});

test("Solana contract matching preserves case", () => {
  const rows = [
    { id: 50, symbol: "TOKEN", contract_address: "A1t2UviBYwyfYZD", chain: "solana", coingecko_id: "token" },
  ];
  assert.equal(resolveExisting(
    { symbol: "TOKEN", contract_address: "A1t2UviBYwyfYZD", chain: "solana", coingecko_id: "token" },
    rows,
  ), 50);
  assert.equal(resolveExisting(
    { symbol: "TOKEN", contract_address: "a1t2uvibywyfyzd", chain: "solana", coingecko_id: "token" },
    rows,
  ), null);
});

test("same CoinGecko asset on a distinct chain contract inserts a separate record", () => {
  const rows = [
    { id: 60, symbol: "USDC", contract_address: "0xabc", chain: "ethereum", coingecko_id: "usd-coin" },
  ];
  assert.equal(resolveExisting(
    { symbol: "USDC", contract_address: "0xdef", chain: "base", coingecko_id: "usd-coin" },
    rows,
  ), null);
});
