/**
 * Behavioral regression test: the initial live-price skeleton must not be
 * dismissed until the LATEST initial fetch has settled.
 *
 * The source problem: React Strict Mode double-invokes effects, which starts
 * two fetches. If the first fetch to settle (not the latest) clears the
 * skeleton, the panel briefly exposes the cached/stale price while the second
 * request is still in flight — the exact flash this feature is meant to hide.
 *
 * The fix uses a generation counter. Each effect invocation increments the
 * counter before starting its initial fetch. The fetch closes over `myGen`
 * and, in its finally-handler, only clears the skeleton when
 * `myGen === initialFetchGenRef.current` (i.e. it is still the latest).
 *
 * This file tests that logic in isolation — no DOM or React required.
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Pure helpers that mirror AssetTrackingView's generation-counter logic
// ---------------------------------------------------------------------------

/** Create the mutable state object that mirrors the component's refs+state. */
function makeState() {
  return {
    initialFetchGen: 0,       // mirrors initialFetchGenRef.current
    livePriceFetchedOnce: false, // mirrors livePriceFetchedOnce.current
    livePriceFetching: false,    // mirrors the livePriceFetching React state
  };
}

/**
 * Simulate the top of the useEffect body firing.
 * Returns the generation number captured in the effect's closure (myGen).
 */
function effectFired(state) {
  if (!state.livePriceFetchedOnce) {
    state.initialFetchGen += 1;
    state.livePriceFetching = true;
  }
  return state.initialFetchGen; // the value closed over as `myGen`
}

/**
 * Simulate the .finally() handler of a live-price fetch.
 * `myGen` is the generation captured when that fetch was started.
 */
function fetchSettled(state, myGen) {
  if (!state.livePriceFetchedOnce && myGen === state.initialFetchGen) {
    state.livePriceFetchedOnce = true;
    state.livePriceFetching = false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("earlier initial fetch settling first must NOT clear the skeleton", () => {
  const state = makeState();

  // React Strict Mode fires the effect twice (mount → cleanup → mount).
  const gen1 = effectFired(state); // first invocation  → gen 1
  const gen2 = effectFired(state); // second invocation → gen 2

  assert.equal(state.livePriceFetching, true, "skeleton must be visible after double-invoke");
  assert.equal(gen1, 1, "first gen must be 1");
  assert.equal(gen2, 2, "second gen must be 2");

  // First (older) fetch resolves — must NOT dismiss the skeleton.
  fetchSettled(state, gen1);
  assert.equal(
    state.livePriceFetching,
    true,
    "skeleton must remain: gen1 is stale, gen2 fetch is still in flight",
  );
  assert.equal(state.livePriceFetchedOnce, false, "livePriceFetchedOnce must still be false");

  // Second (latest) fetch resolves — NOW the skeleton may clear.
  fetchSettled(state, gen2);
  assert.equal(state.livePriceFetching, false, "skeleton must clear once the latest fetch settles");
  assert.equal(state.livePriceFetchedOnce, true, "livePriceFetchedOnce must be true");
});

test("skeleton clears normally when only one initial fetch fires and settles", () => {
  const state = makeState();

  const gen1 = effectFired(state);
  assert.equal(state.livePriceFetching, true, "skeleton must appear on initial load");

  fetchSettled(state, gen1);
  assert.equal(state.livePriceFetching, false, "skeleton must clear after single fetch settles");
  assert.equal(state.livePriceFetchedOnce, true);
});

test("dbTokens change before first fetch settles keeps skeleton up until latest settles", () => {
  const state = makeState();

  // Initial load.
  const gen1 = effectFired(state);

  // dbTokens changes → effect re-fires (cleanup runs, new invocation starts).
  const gen2 = effectFired(state);

  // Older fetch from the initial effect invocation settles first.
  fetchSettled(state, gen1);
  assert.equal(
    state.livePriceFetching,
    true,
    "skeleton must remain: newer fetch (gen2) is still in flight",
  );

  // Newer fetch settles.
  fetchSettled(state, gen2);
  assert.equal(state.livePriceFetching, false, "skeleton clears after the latest fetch settles");
  assert.equal(state.livePriceFetchedOnce, true);
});

test("three overlapping invocations: only the last one can clear the skeleton", () => {
  const state = makeState();

  const gen1 = effectFired(state);
  const gen2 = effectFired(state);
  const gen3 = effectFired(state);

  // Fetches resolve out of order: 2, 1, 3.
  fetchSettled(state, gen2);
  assert.equal(state.livePriceFetching, true, "gen2 is stale; skeleton must remain");

  fetchSettled(state, gen1);
  assert.equal(state.livePriceFetching, true, "gen1 is stale; skeleton must remain");

  fetchSettled(state, gen3);
  assert.equal(state.livePriceFetching, false, "gen3 is current; skeleton must clear");
  assert.equal(state.livePriceFetchedOnce, true);
});

test("periodic 60-second fetches after the initial one do not reactivate the skeleton", () => {
  const state = makeState();

  const gen1 = effectFired(state);
  fetchSettled(state, gen1); // initial fetch complete

  assert.equal(state.livePriceFetchedOnce, true, "initial fetch is done");
  assert.equal(state.livePriceFetching, false);

  // Periodic fetches: effectFired is NOT called (livePriceFetchedOnce is true),
  // so no gen increment happens. Simulating a periodic fetch settling with the
  // existing (now stale) gen must be a no-op.
  fetchSettled(state, gen1); // stale gen — no-op because livePriceFetchedOnce is true
  assert.equal(state.livePriceFetching, false, "skeleton must not reappear for periodic fetches");
  assert.equal(state.livePriceFetchedOnce, true, "livePriceFetchedOnce must remain true");
});
