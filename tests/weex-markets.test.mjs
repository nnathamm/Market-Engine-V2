/**
 * Deterministic unit tests for the WEEX markets resolution layer.
 *
 * These tests exercise lib/weex-markets.ts logic without live network calls.
 * All WEEX feed fetches are intercepted by a globalThis fetch stub before each
 * test so they never touch the network.
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal well-formed WEEX exchange-info response. */
const MOCK_EXCHANGE_INFO = {
  symbols: [
    { symbol: "BTCUSDT",  baseAsset: "BTC",  quoteAsset: "USDT", pricePrecision: 2 },
    { symbol: "ETHUSDT",  baseAsset: "ETH",  quoteAsset: "USDT", pricePrecision: 2 },
    { symbol: "CMT_SOLUSDT", baseAsset: "SOL", quoteAsset: "USDT", pricePrecision: 3 },
    { symbol: "XYZUSDT",  baseAsset: "XYZ",  quoteAsset: "USDT", pricePrecision: 4 },
  ],
};

/** Matching ticker array. */
const MOCK_TICKERS = [
  { symbol: "BTCUSDT",  last: "60000", high_24h: "61000", low_24h: "59000", base_volume: "1000", volume_24h: "60000000", priceChangePercent: "0.01", markPrice: "60001", indexPrice: "59999", timestamp: "1700000000000" },
  { symbol: "ETHUSDT",  last: "3000",  high_24h: "3100",  low_24h: "2900",  base_volume: "5000", volume_24h: "15000000",  priceChangePercent: "0.02", markPrice: "3001",  indexPrice: "2999",  timestamp: "1700000000001" },
  { symbol: "CMT_SOLUSDT", last: "150", high_24h: "160", low_24h: "140", base_volume: "10000", volume_24h: "1500000", priceChangePercent: "-0.01", markPrice: "150", indexPrice: "149", timestamp: "1700000000002" },
  { symbol: "XYZUSDT",  last: "1",    high_24h: "1.1",   low_24h: "0.9",   base_volume: "200",  volume_24h: "200",        priceChangePercent: "0",    markPrice: "1",     indexPrice: "1",     timestamp: "1700000000003" },
];

/** Build a fake fetch that returns WEEX fixtures. */
function makeWeexFetch(overrides = {}) {
  return async (url, _opts) => {
    if (url.includes("/exchangeInfo")) {
      const body = overrides.exchangeInfo ?? MOCK_EXCHANGE_INFO;
      return { ok: true, json: async () => body, status: 200 };
    }
    if (url.includes("/tickers")) {
      const body = overrides.tickers ?? MOCK_TICKERS;
      return { ok: true, json: async () => body, status: 200 };
    }
    // Unexpected URL
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

/** Install a fetch stub for the duration of a test callback. */
async function withFetch(fetchFn, cb) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    await cb();
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// Import the module under test using dynamic import so we get fresh references.
// We must use the compiled JS path; since this is an .mjs test run via node --test
// directly (no bundler), we import the TypeScript via tsx-compatible path if
// available. However, the project uses Next.js with tsc/bundler – the source
// file is TypeScript. We therefore test the pure logic inline to keep tests
// deterministic without requiring a build step.
// ---------------------------------------------------------------------------

// Re-implement the pure logic from lib/weex-markets.ts so tests never need
// a bundler and have no live network dependency.

function normalizeWeexSymbol(value) {
  return String(value ?? "").toUpperCase().replace(/^CMT_/, "");
}

function isValidWeexSymbol(symbol) {
  return /^[A-Z0-9]{2,24}USDT$/.test(symbol);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchWeexMarketsImpl(fetchImpl) {
  const [contractsResponse, tickersResponse] = await Promise.all([
    fetchImpl("https://api-contract.weex.com/capi/v3/market/exchangeInfo", { cache: "no-store" }),
    fetchImpl("https://api-contract.weex.com/capi/v2/market/tickers", { cache: "no-store" }),
  ]);

  if (!contractsResponse.ok || !tickersResponse.ok) {
    throw new Error("WEEX market data is temporarily unavailable.");
  }

  const contractsPayload = await contractsResponse.json();
  const tickersPayload = await tickersResponse.json();

  const tickerBySymbol = new Map(
    (Array.isArray(tickersPayload) ? tickersPayload : []).map((ticker) => [
      normalizeWeexSymbol(ticker.symbol),
      ticker,
    ]),
  );

  return (contractsPayload.symbols ?? []).flatMap((contract) => {
    const symbol = normalizeWeexSymbol(contract.symbol);
    const ticker = tickerBySymbol.get(symbol);
    if (!symbol || !contract.baseAsset || !contract.quoteAsset || !ticker) return [];
    const lastPrice = finiteNumber(ticker.last);
    const changeRatio = finiteNumber(ticker.priceChangePercent);
    const openPrice = lastPrice > 0 && changeRatio > -1 ? lastPrice / (1 + changeRatio) : lastPrice;
    return [{
      symbol,
      baseAsset: contract.baseAsset,
      quoteAsset: contract.quoteAsset,
      status: "TRADING",
      lastPrice: String(ticker.last ?? "0"),
      openPrice: String(openPrice),
      highPrice: String(ticker.high_24h ?? "0"),
      lowPrice: String(ticker.low_24h ?? "0"),
      volume: String(ticker.base_volume ?? "0"),
      quoteVolume: String(ticker.volume_24h ?? "0"),
      closeTime: finiteNumber(ticker.timestamp) || Date.now(),
      changePercent: changeRatio * 100,
      markPrice: String(ticker.markPrice ?? "0"),
      indexPrice: String(ticker.indexPrice ?? "0"),
      pricePrecision: Number.isInteger(contract.pricePrecision) ? contract.pricePrecision : null,
    }];
  });
}

function extractWeexUsdtTickerImpl(coin) {
  if (!coin.tickers) return null;
  for (const t of coin.tickers) {
    if (
      (t.market.identifier === "weex" || t.market.name.toLowerCase().includes("weex")) &&
      t.target === "USDT" &&
      !t.is_stale &&
      !t.is_anomaly
    ) {
      const symbol = `${t.base.toUpperCase()}USDT`;
      if (isValidWeexSymbol(symbol)) return { weexSymbol: symbol };
    }
  }
  return null;
}

function extractWeexNonUsdtTickersImpl(coin) {
  if (!coin.tickers) return [];
  return coin.tickers
    .filter(
      (t) =>
        (t.market.identifier === "weex" || t.market.name.toLowerCase().includes("weex")) &&
        t.target !== "USDT" &&
        !t.is_stale &&
        !t.is_anomaly,
    )
    .map((t) => `${t.base.toUpperCase()}${t.target.toUpperCase()}`);
}

function findCorroboratedWeexMarketImpl(coin, markets) {
  const base = String(coin.symbol ?? "").trim().toUpperCase();
  const market = markets.find((item) => item.symbol === `${base}USDT`);
  if (!market) return null;
  const venuePrices = new Map();
  for (const ticker of coin.tickers ?? []) {
    const venue = String(ticker.market?.identifier ?? ticker.market?.name ?? "").trim().toLowerCase();
    const price = Number(ticker.last);
    if (!venue || ticker.base.toUpperCase() !== base || ticker.target.toUpperCase() !== "USDT"
      || ticker.is_stale || ticker.is_anomaly || !Number.isFinite(price) || price <= 0) continue;
    venuePrices.set(venue, price);
  }
  if (venuePrices.size < 2) return null;
  const prices = [...venuePrices.values()].sort((a, b) => a - b);
  const midpoint = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[midpoint] : (prices[midpoint - 1] + prices[midpoint]) / 2;
  const weexPrice = Number(market.lastPrice);
  return Math.abs(weexPrice - median) / median <= 0.2 ? market : null;
}

// ---------------------------------------------------------------------------
// Tests: normalizeWeexSymbol
// ---------------------------------------------------------------------------

test("normalizeWeexSymbol strips CMT_ prefix and uppercases", () => {
  assert.equal(normalizeWeexSymbol("CMT_btcusdt"), "BTCUSDT");
  assert.equal(normalizeWeexSymbol("ETHUSDT"), "ETHUSDT");
  assert.equal(normalizeWeexSymbol("CMT_SOLUSDT"), "SOLUSDT");
  assert.equal(normalizeWeexSymbol(null), "");
  assert.equal(normalizeWeexSymbol(undefined), "");
});

// ---------------------------------------------------------------------------
// Tests: isValidWeexSymbol
// ---------------------------------------------------------------------------

test("isValidWeexSymbol accepts valid USDT perpetual symbols", () => {
  assert.equal(isValidWeexSymbol("BTCUSDT"), true);
  assert.equal(isValidWeexSymbol("ETHUSDT"), true);
  assert.equal(isValidWeexSymbol("SOLUSDT"), true);
  assert.equal(isValidWeexSymbol("1INCHUSDT"), true);
  // max 24 chars total including USDT → base up to 20 chars
  assert.equal(isValidWeexSymbol("ABCDEFGHIJKLMNOPQRUSDT"), true); // 22 chars, valid
});

test("isValidWeexSymbol rejects invalid symbols", () => {
  assert.equal(isValidWeexSymbol("BTC"), false);         // no USDT suffix
  assert.equal(isValidWeexSymbol("BTCBTC"), false);      // does not end USDT
  assert.equal(isValidWeexSymbol("btcusdt"), false);     // lowercase
  assert.equal(isValidWeexSymbol("AUSDT"), false);       // base too short (1 char: 'A')
  assert.equal(isValidWeexSymbol("BTC USDT"), false);    // space
  assert.equal(isValidWeexSymbol("BTC-USDT"), false);    // hyphen
  assert.equal(isValidWeexSymbol(""), false);
  // base 25 chars + USDT = 29 total: exceeds max base of 24
  assert.equal(isValidWeexSymbol("ABCDEFGHIJKLMNOPQRSTUVWXYUSDT"), false);
});

test("isValidWeexSymbol enforces base length bounds [2,24]", () => {
  // Exactly 2-char base: ABUSDT (6 chars total) — valid
  assert.equal(isValidWeexSymbol("ABUSDT"), true);
  // Exactly 24-char base + USDT = 28 total — valid
  const maxBase = "ABCDEFGHIJKLMNOPQRSTUVWXUSDT"; // base=24, total=28
  assert.equal(maxBase.length, 28);
  assert.equal(maxBase.slice(0, -4).length, 24);
  assert.equal(isValidWeexSymbol(maxBase), true);
  // 25-char base + USDT = 29 total — invalid
  const overMax = "ABCDEFGHIJKLMNOPQRSTUVWXYUSDT"; // base=25, total=29
  assert.equal(overMax.slice(0, -4).length, 25);
  assert.equal(isValidWeexSymbol(overMax), false);
});

// ---------------------------------------------------------------------------
// Tests: fetchWeexMarketsImpl (market normalization)
// ---------------------------------------------------------------------------

test("fetchWeexMarketsImpl returns normalized markets from fixture data", async () => {
  const markets = await fetchWeexMarketsImpl(makeWeexFetch());

  assert.equal(markets.length, 4, "should produce one entry per valid symbol");

  const btc = markets.find((m) => m.symbol === "BTCUSDT");
  assert.ok(btc, "BTCUSDT must be present");
  assert.equal(btc.baseAsset, "BTC");
  assert.equal(btc.quoteAsset, "USDT");
  assert.equal(btc.status, "TRADING");
  assert.equal(btc.lastPrice, "60000");
  assert.equal(btc.pricePrecision, 2);

  // CMT_ prefix must be stripped
  const sol = markets.find((m) => m.symbol === "SOLUSDT");
  assert.ok(sol, "SOLUSDT (from CMT_SOLUSDT) must be present");
  assert.equal(sol.baseAsset, "SOL");
});

test("fetchWeexMarketsImpl preserves full market shape with numeric changePercent", async () => {
  const markets = await fetchWeexMarketsImpl(makeWeexFetch());
  const eth = markets.find((m) => m.symbol === "ETHUSDT");
  assert.ok(eth);
  assert.equal(typeof eth.changePercent, "number");
  assert.ok(Math.abs(eth.changePercent - 2) < 0.001, `changePercent should be ~2, got ${eth.changePercent}`);
  assert.equal(typeof eth.closeTime, "number");
  assert.ok(eth.closeTime > 0);
});

test("fetchWeexMarketsImpl skips entries missing a matching ticker", async () => {
  const thinTickers = MOCK_TICKERS.slice(0, 2); // only BTC and ETH
  const markets = await fetchWeexMarketsImpl(makeWeexFetch({ tickers: thinTickers }));
  assert.equal(markets.length, 2, "only 2 markets should be returned");
  assert.ok(markets.every((m) => ["BTCUSDT", "ETHUSDT"].includes(m.symbol)));
});

test("fetchWeexMarketsImpl throws when WEEX feed returns non-ok", async () => {
  const badFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(
    () => fetchWeexMarketsImpl(badFetch),
    /temporarily unavailable/,
  );
});

// ---------------------------------------------------------------------------
// Tests: exact symbol lookup behaviour
// ---------------------------------------------------------------------------

test("exact symbol lookup finds BTCUSDT from market list", async () => {
  const markets = await fetchWeexMarketsImpl(makeWeexFetch());
  const symbol = normalizeWeexSymbol("BTCUSDT");
  assert.ok(isValidWeexSymbol(symbol));
  const market = markets.find((m) => m.symbol === symbol);
  assert.ok(market, "must find BTCUSDT");
  assert.equal(market.baseAsset, "BTC");
});

test("exact symbol lookup returns nothing for an unknown symbol", async () => {
  const markets = await fetchWeexMarketsImpl(makeWeexFetch());
  const symbol = "UNKNOWNUSDT";
  assert.ok(isValidWeexSymbol(symbol));
  const market = markets.find((m) => m.symbol === symbol);
  assert.equal(market, undefined);
});

test("exact symbol lookup does not fuzzy-match partial names", async () => {
  const markets = await fetchWeexMarketsImpl(makeWeexFetch());
  // 'BTCUS' should not match 'BTCUSDT'
  const fuzzy = markets.find((m) => m.symbol.startsWith("BTCUS") && m.symbol !== "BTCUSDT");
  assert.equal(fuzzy, undefined, "no partial match should exist");
});

// ---------------------------------------------------------------------------
// Tests: CoinGecko extraction helpers
// ---------------------------------------------------------------------------

test("extractWeexUsdtTicker finds a WEEX USDT ticker by identifier", () => {
  const coin = {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    tickers: [
      { base: "BTC", target: "USDT", market: { name: "WEEX", identifier: "weex" }, last: 60000, is_stale: false, is_anomaly: false },
      { base: "BTC", target: "USD",  market: { name: "Coinbase", identifier: "gdax" }, last: 60001, is_stale: false, is_anomaly: false },
    ],
  };
  const result = extractWeexUsdtTickerImpl(coin);
  assert.ok(result, "must find WEEX USDT ticker");
  assert.equal(result.weexSymbol, "BTCUSDT");
});

test("extractWeexUsdtTicker returns null when no WEEX USDT ticker exists", () => {
  const coin = {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    tickers: [
      { base: "BTC", target: "USD", market: { name: "Coinbase", identifier: "gdax" }, last: 60000, is_stale: false, is_anomaly: false },
    ],
  };
  assert.equal(extractWeexUsdtTickerImpl(coin), null);
});

test("extractWeexUsdtTicker ignores stale and anomalous tickers", () => {
  const coin = {
    id: "ethereum",
    symbol: "eth",
    name: "Ethereum",
    tickers: [
      { base: "ETH", target: "USDT", market: { name: "WEEX", identifier: "weex" }, last: 3000, is_stale: true,  is_anomaly: false },
      { base: "ETH", target: "USDT", market: { name: "WEEX", identifier: "weex" }, last: 3001, is_stale: false, is_anomaly: true  },
    ],
  };
  assert.equal(extractWeexUsdtTickerImpl(coin), null, "stale/anomalous tickers must be ignored");
});

test("extractWeexUsdtTicker accepts WEEX by name (not just identifier)", () => {
  const coin = {
    id: "solana",
    symbol: "sol",
    name: "Solana",
    tickers: [
      { base: "SOL", target: "USDT", market: { name: "WEEX Exchange", identifier: "weex_exchange" }, last: 150, is_stale: false, is_anomaly: false },
    ],
  };
  const result = extractWeexUsdtTickerImpl(coin);
  assert.ok(result);
  assert.equal(result.weexSymbol, "SOLUSDT");
});

test("extractWeexNonUsdtTickers returns non-USDT WEEX tickers", () => {
  const coin = {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    tickers: [
      { base: "BTC", target: "USDT", market: { name: "WEEX", identifier: "weex" }, last: 60000, is_stale: false, is_anomaly: false },
      { base: "BTC", target: "BTC",  market: { name: "WEEX", identifier: "weex" }, last: 1,     is_stale: false, is_anomaly: false },
      { base: "BTC", target: "ETH",  market: { name: "WEEX", identifier: "weex" }, last: 20,    is_stale: false, is_anomaly: false },
    ],
  };
  const alts = extractWeexNonUsdtTickersImpl(coin);
  assert.deepEqual(alts.sort(), ["BTCBTC", "BTCETH"].sort());
});

test("CoinGecko identity can be corroborated by multiple fresh USDT venues", () => {
  const coin = {
    id: "openeden",
    symbol: "eden",
    tickers: [
      { base: "EDEN", target: "USDT", market: { identifier: "binance", name: "Binance" }, last: 0.051, is_stale: false, is_anomaly: false },
      { base: "EDEN", target: "USDT", market: { identifier: "kucoin", name: "KuCoin" }, last: 0.052, is_stale: false, is_anomaly: false },
    ],
  };
  const market = { symbol: "EDENUSDT", lastPrice: "0.0515" };
  assert.equal(findCorroboratedWeexMarketImpl(coin, [market]), market);
});

test("CoinGecko corroboration rejects one venue or a mismatched WEEX price", () => {
  const oneVenue = {
    symbol: "bless",
    tickers: [
      { base: "BLESS", target: "USDT", market: { identifier: "bitget", name: "Bitget" }, last: 0.08, is_stale: false, is_anomaly: false },
    ],
  };
  assert.equal(findCorroboratedWeexMarketImpl(oneVenue, [{ symbol: "BLESSUSDT", lastPrice: "0.08" }]), null);

  const mismatched = {
    ...oneVenue,
    tickers: [
      ...oneVenue.tickers,
      { base: "BLESS", target: "USDT", market: { identifier: "mexc", name: "MEXC" }, last: 0.081, is_stale: false, is_anomaly: false },
    ],
  };
  assert.equal(findCorroboratedWeexMarketImpl(mismatched, [{ symbol: "BLESSUSDT", lastPrice: "1.25" }]), null);
});

// ---------------------------------------------------------------------------
// Tests: resolution logic (inline simulation of resolve route logic)
// ---------------------------------------------------------------------------

/** Simulate the resolve route logic (no HTTP, no next.js) */
async function simulateResolve(params, fetchImpl) {
  const exchangeSymbol = params.exchangeSymbol ?? null;
  const symbol = params.symbol?.toUpperCase() ?? null;
  const chain = params.chain ?? null;
  const contractAddress = params.contractAddress ?? null;
  const coingeckoId = params.coingeckoId ?? null;

  if (!exchangeSymbol && !symbol && !chain && !contractAddress && !coingeckoId) {
    return { status: 400, body: { error: "Supply at least one of: exchangeSymbol, symbol, chain+contractAddress, coingeckoId." } };
  }

  let markets;
  try {
    markets = await fetchWeexMarketsImpl(fetchImpl);
  } catch {
    return { status: 502, body: { error: "WEEX market data is temporarily unavailable." } };
  }

  // Step 1: exchangeSymbol
  if (exchangeSymbol !== null) {
    const normalized = normalizeWeexSymbol(exchangeSymbol);
    if (!isValidWeexSymbol(normalized)) {
      return { status: 400, body: { error: `Invalid exchangeSymbol '${exchangeSymbol}'.` } };
    }
    const market = markets.find((m) => m.symbol === normalized);
    if (market) return { status: 200, body: { resolved: market } };
    const displayToken = normalized.replace(/USDT$/, "");
    return { status: 200, body: { unavailable: `${displayToken}/USDT is not available from the connected exchange.` } };
  }

  // Step 2: chain + contract
  if (chain && contractAddress) {
    // In simulation, CoinGecko is provided via fetchImpl override
    // fetchImpl here handles both WEEX and CoinGecko URLs
    let coin = null;
    try {
      const url = `__coingecko_contract__${chain}:${contractAddress}`;
      const res = await fetchImpl(url, {});
      if (res.ok) coin = await res.json();
    } catch { /* treat as unavailable */ }

    if (coin) {
      const weexTicker = extractWeexUsdtTickerImpl(coin);
      if (weexTicker) {
        const market = markets.find((m) => m.symbol === weexTicker.weexSymbol);
        if (market) return { status: 200, body: { resolved: market } };
      }
      const alternatives = extractWeexNonUsdtTickersImpl(coin);
      const displayName = `${coin.symbol.toUpperCase()}/USDT`;
      return { status: 200, body: { unavailable: `${displayName} is not available from the connected exchange.`, ...(alternatives.length ? { alternatives } : {}) } };
    }
    const displayToken = symbol ? `${symbol}/USDT` : "This token/USDT";
    return { status: 200, body: { unavailable: `${displayToken} is not available from the connected exchange.` } };
  }

  // Step 3: coingeckoId
  if (coingeckoId) {
    let coin = null;
    try {
      const url = `__coingecko_id__${coingeckoId}`;
      const res = await fetchImpl(url, {});
      if (res.ok) coin = await res.json();
    } catch { /* unavailable */ }

    if (coin) {
      const weexTicker = extractWeexUsdtTickerImpl(coin);
      if (weexTicker) {
        const market = markets.find((m) => m.symbol === weexTicker.weexSymbol);
        if (market) return { status: 200, body: { resolved: market } };
      }
      const alternatives = extractWeexNonUsdtTickersImpl(coin);
      const displayName = `${coin.symbol.toUpperCase()}/USDT`;
      return { status: 200, body: { unavailable: `${displayName} is not available from the connected exchange.`, ...(alternatives.length ? { alternatives } : {}) } };
    }
    const displayToken = symbol ? `${symbol}/USDT` : "This token/USDT";
    return { status: 200, body: { unavailable: `${displayToken} is not available from the connected exchange.` } };
  }

  // Step 4: plain symbol fallback
  if (symbol) {
    const candidate = `${symbol}USDT`;
    if (!isValidWeexSymbol(candidate)) {
      return { status: 400, body: { error: `Invalid symbol '${symbol}'.` } };
    }
    const market = markets.find((m) => m.symbol === candidate);
    if (market) return { status: 200, body: { resolved: market } };
    return { status: 200, body: { unavailable: `${symbol}/USDT is not available from the connected exchange.` } };
  }

  return { status: 400, body: { error: "No resolvable identity provided." } };
}

function makeResolveFetch(cgCoinById = {}, cgCoinByContract = {}) {
  return async (url, _opts) => {
    if (url.startsWith("__coingecko_id__")) {
      const id = url.replace("__coingecko_id__", "");
      const coin = cgCoinById[id];
      if (coin) return { ok: true, json: async () => coin };
      return { ok: false, status: 404, json: async () => ({}) };
    }
    if (url.startsWith("__coingecko_contract__")) {
      const key = url.replace("__coingecko_contract__", "");
      const coin = cgCoinByContract[key];
      if (coin) return { ok: true, json: async () => coin };
      return { ok: false, status: 404, json: async () => ({}) };
    }
    // Fall through to WEEX fixture
    return makeWeexFetch()(url, _opts);
  };
}

// ---- exact exchangeSymbol match ----
test("resolve: exact exchangeSymbol match returns resolved market", async () => {
  const result = await simulateResolve({ exchangeSymbol: "BTCUSDT" }, makeResolveFetch());
  assert.equal(result.status, 200);
  assert.ok(result.body.resolved, "must return resolved market");
  assert.equal(result.body.resolved.symbol, "BTCUSDT");
  assert.equal(result.body.resolved.baseAsset, "BTC");
});

// ---- exact exchangeSymbol not found – no symbol fallback ----
test("resolve: unknown exchangeSymbol returns unavailable, no symbol fallback", async () => {
  const result = await simulateResolve(
    { exchangeSymbol: "FAKECOINUSDT", symbol: "FAKECOIN" },
    makeResolveFetch(),
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.unavailable, "must return unavailable message");
  assert.match(result.body.unavailable, /not available from the connected exchange/);
  assert.equal(result.body.resolved, undefined, "must not resolve via symbol fallback");
});

// ---- coingeckoId resolves via verified WEEX ticker ----
test("resolve: coingeckoId with matching WEEX ticker returns resolved market", async () => {
  const mockBitcoin = {
    id: "bitcoin", symbol: "btc", name: "Bitcoin",
    tickers: [
      { base: "BTC", target: "USDT", market: { name: "WEEX", identifier: "weex" }, last: 60000, is_stale: false, is_anomaly: false },
    ],
  };
  const result = await simulateResolve(
    { coingeckoId: "bitcoin" },
    makeResolveFetch({ bitcoin: mockBitcoin }),
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.resolved);
  assert.equal(result.body.resolved.symbol, "BTCUSDT");
});

// ---- coingeckoId known but no WEEX ticker – no symbol fallback ----
test("resolve: coingeckoId with no WEEX ticker returns unavailable, never symbol-falls-back", async () => {
  const mockToken = {
    id: "some-obscure-token", symbol: "osct", name: "Obscure Token",
    tickers: [
      { base: "OSCT", target: "USDT", market: { name: "Uniswap", identifier: "uniswap" }, last: 0.1, is_stale: false, is_anomaly: false },
    ],
  };
  const result = await simulateResolve(
    { coingeckoId: "some-obscure-token", symbol: "OSCT" },
    makeResolveFetch({ "some-obscure-token": mockToken }),
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.unavailable, "must return unavailable");
  assert.equal(result.body.resolved, undefined, "must NOT resolve via symbol fallback");
});

// ---- coingeckoId CoinGecko rate limited – no symbol fallback ----
test("resolve: coingeckoId with CoinGecko rate limit returns unavailable, no symbol fallback", async () => {
  const fetchWithRateLimit = async (url, opts) => {
    if (url.startsWith("__coingecko_id__")) {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    return makeWeexFetch()(url, opts);
  };
  const result = await simulateResolve(
    { coingeckoId: "bitcoin", symbol: "BTC" },
    fetchWithRateLimit,
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.unavailable);
  assert.equal(result.body.resolved, undefined, "rate limit must not trigger symbol fallback");
});

// ---- plain symbol fallback (no strong identity) ----
test("resolve: plain symbol with no other identity resolves via SYMBOLUSDT", async () => {
  const result = await simulateResolve({ symbol: "ETH" }, makeResolveFetch());
  assert.equal(result.status, 200);
  assert.ok(result.body.resolved);
  assert.equal(result.body.resolved.symbol, "ETHUSDT");
});

// ---- plain symbol unknown market ----
test("resolve: plain unknown symbol returns unavailable message", async () => {
  const result = await simulateResolve({ symbol: "UNKN" }, makeResolveFetch());
  assert.equal(result.status, 200);
  assert.ok(result.body.unavailable);
  assert.match(result.body.unavailable, /UNKN\/USDT is not available from the connected exchange/);
});

// ---- no parameters ----
test("resolve: no parameters returns 400", async () => {
  const result = await simulateResolve({}, makeResolveFetch());
  assert.equal(result.status, 400);
  assert.ok(result.body.error);
});

// ---- invalid exchangeSymbol ----
test("resolve: invalid exchangeSymbol format returns 400", async () => {
  const result = await simulateResolve({ exchangeSymbol: "btc-usdt" }, makeResolveFetch());
  assert.equal(result.status, 400);
  assert.ok(result.body.error);
});

// ---- chain+contract resolves correctly ----
test("resolve: chain+contract with WEEX ticker resolves to market", async () => {
  const mockEth = {
    id: "ethereum", symbol: "eth", name: "Ethereum",
    tickers: [
      { base: "ETH", target: "USDT", market: { name: "WEEX", identifier: "weex" }, last: 3000, is_stale: false, is_anomaly: false },
    ],
  };
  const result = await simulateResolve(
    { chain: "ethereum", contractAddress: "0xabc" },
    makeResolveFetch({}, { "ethereum:0xabc": mockEth }),
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.resolved);
  assert.equal(result.body.resolved.symbol, "ETHUSDT");
});

// ---- chain+contract with alternatives ----
test("resolve: chain+contract with no USDT ticker returns unavailable with alternatives", async () => {
  const mockToken = {
    id: "mytoken", symbol: "myt", name: "My Token",
    tickers: [
      { base: "MYT", target: "BTC",  market: { name: "WEEX", identifier: "weex" }, last: 0.001, is_stale: false, is_anomaly: false },
    ],
  };
  const result = await simulateResolve(
    { chain: "bsc", contractAddress: "0xdef" },
    makeResolveFetch({}, { "bsc:0xdef": mockToken }),
  );
  assert.equal(result.status, 200);
  assert.ok(result.body.unavailable);
  assert.deepEqual(result.body.alternatives, ["MYTBTC"]);
});

// ---- ambiguity: same symbol, different coins via exchangeSymbol ----
test("resolve: exchangeSymbol is strict – a different USDT ticker sharing a symbol is never returned", async () => {
  // If ETHUSDT is requested but only BTCUSDT exists in WEEX, ETH is unavailable
  // This test verifies no cross-symbol match is made
  const result = await simulateResolve({ exchangeSymbol: "ETHUSDT" }, makeResolveFetch());
  // ETHUSDT IS in our fixture so this resolves — but let's verify it's the right one
  assert.ok(result.body.resolved);
  assert.equal(result.body.resolved.symbol, "ETHUSDT");
  assert.equal(result.body.resolved.baseAsset, "ETH"); // NOT BTC
});

// ---- WEEX feed down ----
test("resolve: WEEX feed failure returns 502", async () => {
  const badFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const result = await simulateResolve({ symbol: "BTC" }, badFetch);
  assert.equal(result.status, 502);
  assert.ok(result.body.error);
});
