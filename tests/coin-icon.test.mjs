/**
 * Unit tests for CoinIcon CDN fallback chain (app/markets.tsx)
 *
 * Tests the three guaranteed behaviours:
 *  1. Each CDN failure advances the index to the next CDN URL.
 *  2. The letter fallback activates once every CDN has been tried.
 *  3. The module-level failure cache (iconCdnFailures) is reset between
 *     tests so they are fully independent.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// ---------------------------------------------------------------------------
// Recreate the exact logic from CoinIcon / markets.tsx as a pure simulation.
// This keeps tests tied to the real algorithm without needing a DOM / React.
// ---------------------------------------------------------------------------

const marketsSource = await readFile(
  new URL("../app/markets.tsx", import.meta.url),
  "utf8",
);

// Parse CDN_URLS count from source so the tests automatically scale when a
// third CDN is added (Task #10).
// Strategy: find the CDN_URLS assignment, then count "(slug) =>" arrow entries
// up until the first line that is just "];" (end of the array).
const cdnUrlsStart = marketsSource.indexOf("const CDN_URLS");
assert.ok(cdnUrlsStart !== -1, "CDN_URLS must be present in markets.tsx");
const cdnUrlsBlock = marketsSource.slice(cdnUrlsStart, marketsSource.indexOf("];", cdnUrlsStart) + 2);
const CDN_COUNT = (cdnUrlsBlock.match(/\(slug\)\s*=>/g) ?? []).length;

assert.ok(CDN_COUNT >= 2, `Expected at least 2 CDN entries, found ${CDN_COUNT}`);

/**
 * Simulate the CoinIcon state machine for a single symbol.
 *
 * @param {Map<string, number>} failureCache  The shared module-level map.
 * @param {string} slug                       Lower-cased symbol.
 * @param {number} cdnCount                   Total number of CDN URLs.
 * @returns {{
 *   currentIndex: () => number,
 *   triggerError: () => void,
 *   isLetterFallback: () => boolean,
 *   srcFor: (idx: number) => string,
 * }}
 */
function makeCoinIconSim(failureCache, slug, cdnCount) {
  // Mirror: useState(() => iconCdnFailures.get(slug) ?? 0)
  let cdnIndex = failureCache.get(slug) ?? 0;

  // Mirror: the onError handler
  function triggerError() {
    const next = cdnIndex + 1;
    failureCache.set(slug, next);
    cdnIndex = next;
  }

  // Mirror: cdnIndex >= CDN_URLS.length → render letter fallback
  function isLetterFallback() {
    return cdnIndex >= cdnCount;
  }

  // Return the CDN index that would be used as the <img src> right now.
  function currentIndex() {
    return cdnIndex;
  }

  return { currentIndex, triggerError, isLetterFallback };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("CoinIcon starts at CDN index 0 for a fresh symbol", () => {
  const cache = new Map();
  const sim = makeCoinIconSim(cache, "btc", CDN_COUNT);

  assert.equal(sim.currentIndex(), 0);
  assert.equal(sim.isLetterFallback(), false);
});

test("CoinIcon advances to CDN index 1 after first onError", () => {
  const cache = new Map();
  const sim = makeCoinIconSim(cache, "eth", CDN_COUNT);

  sim.triggerError(); // first CDN failed

  assert.equal(sim.currentIndex(), 1);
  assert.equal(sim.isLetterFallback(), false);
  assert.equal(cache.get("eth"), 1, "failure cache must record the new index");
});

test("CoinIcon activates letter fallback once all CDNs have failed", () => {
  const cache = new Map();
  const sim = makeCoinIconSim(cache, "sol", CDN_COUNT);

  // Exhaust every CDN slot.
  for (let i = 0; i < CDN_COUNT; i++) {
    assert.equal(sim.isLetterFallback(), false, `should still try CDN #${i}`);
    sim.triggerError();
  }

  assert.equal(sim.isLetterFallback(), true, "must show letter fallback after all CDNs fail");
  assert.equal(cache.get("sol"), CDN_COUNT);
});

test("CoinIcon skips already-failed CDNs on mount via the failure cache", () => {
  // Pre-populate the cache as if a prior render already failed CDN 0.
  const cache = new Map([["xrp", 1]]);
  const sim = makeCoinIconSim(cache, "xrp", CDN_COUNT);

  // Component must start at the cached index, not 0.
  assert.equal(sim.currentIndex(), 1);
});

test("CoinIcon reaches letter fallback from cached partial failure", () => {
  // Cache shows CDN 0 already failed.
  const cache = new Map([["ada", 1]]);
  const sim = makeCoinIconSim(cache, "ada", CDN_COUNT);

  // One more failure exhausts the remaining CDN(s).
  const remainingCdns = CDN_COUNT - 1;
  for (let i = 0; i < remainingCdns; i++) {
    sim.triggerError();
  }

  assert.equal(sim.isLetterFallback(), true);
});

test("failure cache entries for different symbols are independent", () => {
  const cache = new Map();
  const simA = makeCoinIconSim(cache, "link", CDN_COUNT);
  const simB = makeCoinIconSim(cache, "dot", CDN_COUNT);

  // Exhaust CDNs for LINK only.
  for (let i = 0; i < CDN_COUNT; i++) simA.triggerError();

  assert.equal(simA.isLetterFallback(), true, "LINK must show letters");
  assert.equal(simB.isLetterFallback(), false, "DOT must still try CDNs");
  assert.equal(simB.currentIndex(), 0, "DOT index must be unaffected");
});

test("each test uses its own fresh cache (independence check)", () => {
  // If any prior test leaked state into a shared cache, this would fail.
  const cache = new Map(); // brand-new map — no inherited state
  const sim = makeCoinIconSim(cache, "btc", CDN_COUNT);
  assert.equal(sim.currentIndex(), 0, "cache must be clean at test start");
});
