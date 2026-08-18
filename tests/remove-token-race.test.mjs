/**
 * Behavioral regression test: removing a tracked token must prevent a
 * concurrently-in-flight live-price response from reinserting the stale entry.
 *
 * Simulates the logic in AssetTrackingView without a DOM or React:
 *  - trackedSymbolsRef  →  plain Set (mutated synchronously on delete)
 *  - live-price fetch filter  →  pure function over the Set
 *  - removeToken sequence  →  ordinary async function
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Helpers that mirror the source logic
// ---------------------------------------------------------------------------

/**
 * Simulate the live-price fetch callback filter.
 * Returns only entries whose symbol is still in trackedSymbols.
 */
function applyLivePriceFilter(rawData, trackedSymbols) {
  return Object.fromEntries(
    Object.entries(rawData).filter(([sym]) => trackedSymbols.has(sym)),
  );
}

/**
 * Simulate the removeToken sequence:
 *  1. Await the DELETE fetch
 *  2. If ok: synchronously evict symbol from ref, prune liveData, refresh list
 */
async function simulateRemoveToken({ symbol, deleteResponse, trackedSymbols, liveData }) {
  const res = deleteResponse;
  if (!res.ok) return { pruned: false };

  // Synchronous ref eviction — mirrors: trackedSymbolsRef.current.delete(symbol)
  trackedSymbols.delete(symbol);

  // Synchronous liveData prune — mirrors: setLiveData(prev => { next.delete(symbol); })
  liveData.delete(symbol);

  // refreshTokens() would happen here (async, not modelled — not needed for the race)
  return { pruned: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("in-flight response arriving after successful DELETE is filtered out", async () => {
  const trackedSymbols = new Set(["BTC", "ETH"]);
  const liveData = new Map([
    ["BTC", { priceUsd: 60000, changePercent24Hr: 2.5 }],
    ["ETH", { priceUsd: 3000, changePercent24Hr: 1.1 }],
  ]);

  // Simulate a live-price fetch that was started BEFORE the DELETE fires.
  // We hold it pending until after removeToken completes.
  let resolveInflight;
  const inflightFetch = new Promise(resolve => { resolveInflight = resolve; });

  // Fire removeToken (DELETE succeeds).
  await simulateRemoveToken({
    symbol: "BTC",
    deleteResponse: { ok: true },
    trackedSymbols,
    liveData,
  });

  // BTC must already be gone from both structures.
  assert.equal(trackedSymbols.has("BTC"), false, "trackedSymbols must not contain BTC after delete");
  assert.equal(liveData.has("BTC"), false, "liveData must not contain BTC after delete");

  // Now the in-flight request resolves with the full (pre-deletion) payload.
  resolveInflight({
    BTC: { priceUsd: 60000, changePercent24Hr: 2.5 },
    ETH: { priceUsd: 3001, changePercent24Hr: 1.2 },
  });
  const rawData = await inflightFetch;

  // Apply the filter the way the live-price callback does.
  const filtered = applyLivePriceFilter(rawData, trackedSymbols);

  assert.ok(!("BTC" in filtered), "stale BTC price must be filtered out — ref was evicted synchronously");
  assert.ok("ETH" in filtered, "ETH price must still be present");
});

test("in-flight response arriving after a FAILED DELETE is NOT filtered out", async () => {
  // If DELETE fails, the token is still tracked — its price should be kept.
  const trackedSymbols = new Set(["BTC", "ETH"]);
  const liveData = new Map([
    ["BTC", { priceUsd: 60000, changePercent24Hr: 2.5 }],
  ]);

  await simulateRemoveToken({
    symbol: "BTC",
    deleteResponse: { ok: false },
    trackedSymbols,
    liveData,
  });

  // DELETE failed — nothing should have changed.
  assert.equal(trackedSymbols.has("BTC"), true, "trackedSymbols must still contain BTC after failed delete");
  assert.equal(liveData.has("BTC"), true, "liveData must still contain BTC after failed delete");

  const rawData = { BTC: { priceUsd: 60000, changePercent24Hr: 2.5 }, ETH: { priceUsd: 3001, changePercent24Hr: 1.2 } };
  const filtered = applyLivePriceFilter(rawData, trackedSymbols);

  assert.ok("BTC" in filtered, "BTC price must be retained when DELETE failed");
});

test("re-adding the deleted token after a successful DELETE shows fresh data, not the stale price", async () => {
  const trackedSymbols = new Set(["BTC", "ETH"]);
  const liveData = new Map([
    ["BTC", { priceUsd: 60000, changePercent24Hr: 2.5 }],
    ["ETH", { priceUsd: 3000, changePercent24Hr: 1.1 }],
  ]);

  // DELETE BTC.
  await simulateRemoveToken({
    symbol: "BTC",
    deleteResponse: { ok: true },
    trackedSymbols,
    liveData,
  });

  // Stale in-flight response arrives — must be blocked.
  const staleData = { BTC: { priceUsd: 60000, changePercent24Hr: 2.5 }, ETH: { priceUsd: 3001 } };
  const afterDelete = applyLivePriceFilter(staleData, trackedSymbols);
  assert.ok(!("BTC" in afterDelete), "stale price must not enter liveData after deletion");

  // User re-adds BTC. trackedSymbols is repopulated by refreshTokens.
  trackedSymbols.add("BTC");

  // A new live-price response arrives with a fresh price.
  const freshData = { BTC: { priceUsd: 61000, changePercent24Hr: 3.0 }, ETH: { priceUsd: 3001 } };
  const afterReadd = applyLivePriceFilter(freshData, trackedSymbols);

  assert.ok("BTC" in afterReadd, "re-added BTC must appear in filtered result");
  assert.equal(afterReadd.BTC.priceUsd, 61000, "price shown after re-add must be the fresh price, not the stale one");
});
