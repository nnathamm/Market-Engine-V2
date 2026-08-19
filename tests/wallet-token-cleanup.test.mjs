import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTokenIdentityKey,
  walletNetworkToChain,
} from "../lib/token-identity.ts";

const sources = Promise.all([
  readFile(new URL("../lib/token-cleanup.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/asset-tracking.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/wallet-portfolio/[id]/route.ts", import.meta.url), "utf8"),
]);

test("same ticker on different contracts is not treated as a shared wallet token", () => {
  const trackedFromWalletA = buildTokenIdentityKey({
    symbol: "SAME",
    chain: "Ethereum",
    contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const holdingInWalletB = buildTokenIdentityKey({
    symbol: "SAME",
    chain: walletNetworkToChain("eth-mainnet"),
    contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });

  assert.notEqual(trackedFromWalletA, holdingInWalletB);
});

test("the same EVM contract is shared regardless of address casing", () => {
  const trackedFromWalletA = buildTokenIdentityKey({
    symbol: "SAME",
    chain: "Ethereum",
    contractAddress: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
  });
  const holdingInWalletB = buildTokenIdentityKey({
    symbol: "SAME",
    chain: walletNetworkToChain("eth-mainnet"),
    contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  assert.equal(trackedFromWalletA, holdingInWalletB);
});

test("wallet deletion, preview, and keep choices all use stable identities", async () => {
  const [cleanup, tracking, route] = await sources;

  assert.match(cleanup, /peerWalletByIdentity/);
  assert.match(cleanup, /buildTokenIdentityKey/);
  assert.match(cleanup, /pg_advisory_xact_lock/);
  assert.match(cleanup, /DELETE FROM wallet_portfolio WHERE id = \$1/);
  assert.match(cleanup, /UPDATE tracked_tokens SET wallet_source = \$2 WHERE id = \$1/);
  assert.match(cleanup, /DELETE FROM tracked_tokens WHERE id = \$1/);
  assert.doesNotMatch(cleanup, /otherSymbols/);

  assert.match(tracking, /otherIdentities/);
  assert.match(tracking, /!otherIdentities\.has\(trackedTokenIdentity\(t\)\)/);
  assert.match(tracking, /useState<Set<number>>/);
  assert.match(tracking, /<li key=\{t\.id\}>/);
  assert.match(tracking, /JSON\.stringify\(\{ keepTokenIds \}\)/);

  assert.match(route, /keepTokenIds\?: number\[\]/);
  assert.match(route, /removeWalletAndTokens\(id, \{ keepTokenIds, keepSymbols \}\)/);
  assert.doesNotMatch(route, /portfolioService\.store\.remove/);
});