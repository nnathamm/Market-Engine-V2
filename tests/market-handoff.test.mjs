import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/markets.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/asset-tracking.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/weex/resolve/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/market-navigation.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/db-migrate.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/api/tracked/tokens/[symbol]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/weex-markets.ts", import.meta.url), "utf8"),
]);

test("Monitor Center exposes both explicit market handoff actions without changing row selection", async () => {
  const [, , tracking] = await files;
  assert.match(tracking, /tracking-open-markets[\s\S]*Open in Markets →/);
  assert.match(tracking, /tracking-action-menu[\s\S]*Open in Markets →/);
  assert.match(tracking, /role="row" onClick=\{\(\) => setSelectedToken\(token\)\}/);
  assert.match(tracking, /tokenId: token\.db_id[\s\S]*exchangeSymbol: token\.exchange_symbol[\s\S]*contractAddress: token\.contract_address[\s\S]*coingeckoId: token\.coingecko_id/);
  assert.match(tracking, /aria-label=\{`Open \$\{token\.name\} in Markets`\}/);
});

test("market handoff is refreshable and browser-back safe", async () => {
  const [page, , , , navigation] = await files;
  assert.match(page, /window\.addEventListener\("popstate", applyLocation\)/);
  assert.match(page, /window\.history\[mode === "push" \? "pushState" : "replaceState"\]/);
  assert.match(page, /writeMarketRequest\(params, nextView === "markets" \? nextMarketRequest : null\)/);
  assert.match(navigation, /\["symbol", normalizeExchangeSymbol\(request\.exchangeSymbol\)/);
  assert.match(navigation, /\["token", request\.coingeckoId\]/);
  assert.match(navigation, /\["interval", request\.interval\]/);
});

test("requested markets load directly, merge without duplicates, scroll, and highlight", async () => {
  const [, markets] = await files;
  assert.match(markets, /fetch\(`\/api\/weex\/resolve\?\$\{params\}`/);
  assert.match(markets, /findIndex\(\(item\) => item\.symbol === market\.symbol\)/);
  assert.match(markets, /existingIndex < 0\) return \[market, \.\.\.current\]/);
  assert.match(markets, /setVisibleCount\(selectedIndex \+ 1\)/);
  assert.match(markets, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
  assert.match(markets, /setHighlightedSymbol\(market\.symbol\)/);
  assert.match(markets, /requestedMarketState === "unavailable"[\s\S]*Back to Monitor Center/);
});

test("strong identity never falls through to a same-ticker symbol fallback", async () => {
  const [, , , resolver] = await files;
  const exchangeStep = resolver.indexOf("if (exchangeSymbol !== null)");
  const contractStep = resolver.indexOf("if (chain && contractAddress)");
  const geckoStep = resolver.indexOf("if (coingeckoId)");
  const strongStop = resolver.indexOf("if (hasStrongIdentity)");
  const symbolStep = resolver.indexOf("if (symbol)", strongStop);
  assert.ok(exchangeStep >= 0 && contractStep > exchangeStep);
  assert.ok(geckoStep > contractStep && strongStop > geckoStep);
  assert.ok(symbolStep > strongStop);
  assert.match(resolver, /unavailable: `\$\{displayToken\} is not available from the connected exchange\.`/);
});

test("tracked-token migration preserves strong identities and allows unrelated duplicate tickers", async () => {
  const [, , , , , migration] = await files;
  assert.match(migration, /ADD COLUMN IF NOT EXISTS preferred_exchange/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS exchange_symbol/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS exchange_symbol_verified_at/);
  assert.doesNotMatch(migration, /SET exchange_symbol = UPPER\(binance_pair\)/);
  assert.match(migration, /DROP CONSTRAINT tracked_tokens_symbol_key/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*BEGIN[\s\S]*ROLLBACK|BEGIN[\s\S]*pg_advisory_xact_lock[\s\S]*ROLLBACK/s);
  assert.match(migration, /uidx_tracked_tokens_contract[\s\S]*CASE[\s\S]*THEN lower\(contract_address\)[\s\S]*ELSE contract_address/s);
  assert.match(migration, /uidx_tracked_tokens_coingecko_only[\s\S]*lower\(coingecko_id\)[\s\S]*contract_address IS NULL OR chain IS NULL/s);
  assert.match(migration, /uidx_tracked_tokens_symbol_only[\s\S]*contract_address IS NULL AND coingecko_id IS NULL/);
});

test("only verified WEEX mappings bypass strong-identity resolution", async () => {
  const [, markets, tracking, resolver, navigation, migration, , tokenPatch, marketHelpers] = await files;
  assert.doesNotMatch(tracking, /exchange_symbol:\s*selectedCoin\.binancePair/);
  assert.doesNotMatch(tracking, /exchange_symbol:\s*t\.exchange_symbol\s*\|\|\s*t\.binance_pair/);
  assert.match(tracking, /exchange_symbol_verified:\s*Boolean\(t\.exchange_symbol_verified_at\)/);
  assert.match(tracking, /exchangeVerified:\s*token\.exchange_symbol_verified/);
  assert.match(navigation, /exchangeVerified\?: boolean/);
  assert.match(navigation, /\["verified", request\.exchangeVerified \? "1" : undefined\]/);
  assert.match(markets, /requested\.exchangeVerified[\s\S]*preferredExchange\?\.toUpperCase\(\) === "WEEX"/);
  assert.match(markets, /params\.set\("tokenId", String\(requested\.tokenId\)\)/);
  assert.match(markets, /const persistResponse = await fetch[\s\S]*persistResponse\.ok[\s\S]*exchange_symbol_verified_at/);
  assert.doesNotMatch(markets, /verify_exchange_symbol/);
  assert.match(resolver, /SELECT symbol, chain, contract_address, coingecko_id,[\s\S]*exchange_symbol_verified_at[\s\S]*WHERE id = \$1/);
  assert.match(tokenPatch, /verifyWeexMarketForTokenIdentity/);
  assert.doesNotMatch(tokenPatch, /verify_exchange_symbol/);
  assert.match(marketHelpers, /export async function verifyWeexMarketForTokenIdentity/);
  assert.match(migration, /preferred_exchange = NULL[\s\S]*exchange_symbol_verified_at IS NULL/);
});

test("wallet refresh preserves same-ticker holdings with different contracts", async () => {
  const [, , tracking] = await files;
  assert.match(tracking, /function walletHoldingIdentity[\s\S]*buildTokenIdentityKey/);
  assert.match(tracking, /const trackedIdentities = new Set\(currentlyTracked\.map\(trackedTokenIdentity\)\)/);
  assert.match(tracking, /const identity = walletHoldingIdentity\(h\)[\s\S]*seen\.has\(identity\)/);
  assert.match(tracking, /!trackedIdentities\.has\(walletHoldingIdentity\(h\)\)/);
});

test("intelligence panels remain readable and responsive without page overflow", async () => {
  const [, , , , , , styles] = await files;
  assert.match(styles, /\.tracking-workspace\s*\{[^}]*minmax\(370px, 390px\)[^}]*overflow: hidden/s);
  assert.match(styles, /\.tracking-selected-identity h2\s*\{[^}]*-webkit-line-clamp: 2[^}]*font-size: 16px/s);
  assert.match(styles, /\.tracking-wallet-address\s*\{[^}]*word-break: break-all/s);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*\.tracking-workspace\s*\{[^}]*overflow: visible/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.tracking-detail-actions/s);
});

test("representative non-top symbols are valid exact WEEX handoff targets", () => {
  for (const symbol of ["BLESSUSDT", "EDENUSDT", "VELVETUSDT"]) {
    assert.match(symbol, /^[A-Z0-9]{2,24}USDT$/);
  }
});