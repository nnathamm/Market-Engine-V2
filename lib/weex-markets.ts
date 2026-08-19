/**
 * Shared WEEX market normalization layer.
 * Used by both /api/weex/markets and /api/weex/resolve.
 */
import { normalizeChain, normalizeContractAddress } from "@/lib/token-identity";

export type WeexMarket = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: "TRADING";
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
  changePercent: number;
  markPrice: string;
  indexPrice: string;
  pricePrecision: number | null;
};

type WeexRawSymbol = {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  pricePrecision?: number;
};

type WeexRawTicker = {
  symbol?: string;
  last?: string;
  high_24h?: string;
  low_24h?: string;
  volume_24h?: string;
  base_volume?: string;
  timestamp?: string;
  priceChangePercent?: string;
  markPrice?: string;
  indexPrice?: string;
};

const WEEX_MARKET_API = "https://api-contract.weex.com";

/** Strip the CMT_ prefix WEEX uses internally and uppercase. */
export function normalizeWeexSymbol(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/^CMT_/, "");
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Fetch and merge WEEX contracts + tickers into a normalized market list. */
export async function fetchWeexMarkets(): Promise<WeexMarket[]> {
  const [contractsResponse, tickersResponse] = await Promise.all([
    fetch(`${WEEX_MARKET_API}/capi/v3/market/exchangeInfo`, { cache: "no-store" }),
    fetch(`${WEEX_MARKET_API}/capi/v2/market/tickers`, { cache: "no-store" }),
  ]);

  if (!contractsResponse.ok || !tickersResponse.ok) {
    throw new Error("WEEX market data is temporarily unavailable.");
  }

  const contractsPayload = (await contractsResponse.json()) as { symbols?: WeexRawSymbol[] };
  const tickersPayload = (await tickersResponse.json()) as WeexRawTicker[];

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
    return [
      {
        symbol,
        baseAsset: contract.baseAsset,
        quoteAsset: contract.quoteAsset,
        status: "TRADING" as const,
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
        pricePrecision: Number.isInteger(contract.pricePrecision) ? contract.pricePrecision! : null,
      },
    ];
  });
}

/** Validate that a symbol matches the required WEEX USDT perpetual pattern. */
export function isValidWeexSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{2,24}USDT$/.test(symbol);
}

/**
 * Look up a single WEEX USDT perpetual market by exact normalized symbol.
 * Returns null if the symbol is invalid, not found, or the feed is unavailable.
 */
export async function findWeexMarket(
  rawSymbol: string,
  markets?: WeexMarket[],
): Promise<WeexMarket | null> {
  const symbol = normalizeWeexSymbol(rawSymbol);
  if (!isValidWeexSymbol(symbol)) return null;
  const list = markets ?? (await fetchWeexMarkets());
  return list.find((m) => m.symbol === symbol) ?? null;
}

// ---------------------------------------------------------------------------
// CoinGecko helpers — server-side only, no client secret required.
// ---------------------------------------------------------------------------

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export type CoinGeckoCoinDetail = {
  id: string;
  symbol: string;
  name: string;
  /** tickers from exchanges */
  tickers?: Array<{
    base: string;
    target: string;
    market: { name: string; identifier: string };
    last: number;
    is_stale: boolean;
    is_anomaly: boolean;
  }>;
  platforms?: Record<string, string>;
};

/**
 * Fetch CoinGecko coin detail by id.
 * Returns null on any error or rate limit (treat as unavailable, not an error).
 */
export async function fetchCoinGeckoById(id: string): Promise<CoinGeckoCoinDetail | null> {
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=true&market_data=false&community_data=false&developer_data=false`,
      { cache: "no-store" },
    );
    if (res.status === 429 || res.status === 503 || !res.ok) return null;
    return (await res.json()) as CoinGeckoCoinDetail;
  } catch {
    return null;
  }
}

/**
 * Resolve a contract address + chain to a CoinGecko coin id via
 * /coins/list/new is not reliable; instead use /coins/{id}/contract/{address}
 * on the asset_platforms. We use the simpler search-by-contract endpoint.
 *
 * CoinGecko free-tier: GET /coins/{platform_id}/contract/{contract_address}
 */
export async function fetchCoinGeckoByContract(
  chain: string,
  contractAddress: string,
): Promise<CoinGeckoCoinDetail | null> {
  // Map common chain names to CoinGecko platform ids
  const platformId = chainToPlatformId(chain);
  if (!platformId) return null;
  const normalizedAddress = normalizeContractAddress(contractAddress, normalizeChain(chain));
  if (!normalizedAddress) return null;
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${encodeURIComponent(platformId)}/contract/${encodeURIComponent(normalizedAddress)}`,
      { cache: "no-store" },
    );
    if (res.status === 429 || res.status === 503 || !res.ok) return null;
    const coin = (await res.json()) as CoinGeckoCoinDetail;
    // Attach tickers: fetch via coin detail
    return fetchCoinGeckoById(coin.id);
  } catch {
    return null;
  }
}

/** Extract a verified WEEX USDT ticker from CoinGecko coin detail. */
export function extractWeexUsdtTicker(
  coin: CoinGeckoCoinDetail,
): { weexSymbol: string } | null {
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

/**
 * Corroborate a CoinGecko identity against an exact WEEX market when CoinGecko
 * omits WEEX from its exchange list. This is deliberately stronger than ticker
 * matching: at least two fresh CoinGecko-verified USDT venues must agree on the
 * token's price, and the WEEX contract must be within 20% of their median.
 */
export function findCorroboratedWeexMarket(
  coin: CoinGeckoCoinDetail,
  markets: WeexMarket[],
): WeexMarket | null {
  const base = String(coin.symbol ?? "").trim().toUpperCase();
  const candidateSymbol = `${base}USDT`;
  if (!isValidWeexSymbol(candidateSymbol)) return null;

  const market = markets.find((item) => item.symbol === candidateSymbol);
  if (!market) return null;

  const venuePrices = new Map<string, number>();
  for (const ticker of coin.tickers ?? []) {
    const venue = String(ticker.market?.identifier ?? ticker.market?.name ?? "").trim().toLowerCase();
    const price = Number(ticker.last);
    if (
      !venue
      || ticker.base.toUpperCase() !== base
      || ticker.target.toUpperCase() !== "USDT"
      || ticker.is_stale
      || ticker.is_anomaly
      || !Number.isFinite(price)
      || price <= 0
    ) continue;
    venuePrices.set(venue, price);
  }
  if (venuePrices.size < 2) return null;

  const prices = [...venuePrices.values()].sort((a, b) => a - b);
  const midpoint = Math.floor(prices.length / 2);
  const median = prices.length % 2
    ? prices[midpoint]
    : (prices[midpoint - 1] + prices[midpoint]) / 2;
  const weexPrice = Number(market.lastPrice);
  if (!Number.isFinite(weexPrice) || weexPrice <= 0 || median <= 0) return null;
  return Math.abs(weexPrice - median) / median <= 0.2 ? market : null;
}

function findMarketForCoin(coin: CoinGeckoCoinDetail, markets: WeexMarket[]): WeexMarket | null {
  const directTicker = extractWeexUsdtTicker(coin);
  if (directTicker) {
    const directMarket = markets.find((market) => market.symbol === directTicker.weexSymbol);
    if (directMarket) return directMarket;
  }
  return findCorroboratedWeexMarket(coin, markets);
}

/**
 * Independently verify that a requested WEEX symbol belongs to a tracked
 * token's canonical identity. Client-provided "verified" flags are never used.
 */
export async function verifyWeexMarketForTokenIdentity(input: {
  expectedExchangeSymbol: string;
  symbol: string;
  chain?: string | null;
  contractAddress?: string | null;
  coingeckoId?: string | null;
}): Promise<boolean> {
  const expected = normalizeWeexSymbol(input.expectedExchangeSymbol);
  if (!isValidWeexSymbol(expected)) return false;
  const markets = await fetchWeexMarkets();

  if (input.chain && input.contractAddress) {
    const contractCoin = await fetchCoinGeckoByContract(input.chain, input.contractAddress);
    if (contractCoin) {
      return findMarketForCoin(contractCoin, markets)?.symbol === expected;
    }
  }

  if (input.coingeckoId) {
    const coin = await fetchCoinGeckoById(input.coingeckoId);
    if (coin) {
      return findMarketForCoin(coin, markets)?.symbol === expected;
    }
  }

  if ((input.chain && input.contractAddress) || input.coingeckoId) return false;
  const candidate = `${String(input.symbol ?? "").trim().toUpperCase()}USDT`;
  return candidate === expected && markets.some((market) => market.symbol === expected);
}

/** Extract any non-USDT WEEX tickers from CoinGecko coin detail. */
export function extractWeexNonUsdtTickers(
  coin: CoinGeckoCoinDetail,
): string[] {
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

/** Map common chain identifiers to CoinGecko platform ids. */
function chainToPlatformId(chain: string): string | null {
  const map: Record<string, string> = {
    ethereum: "ethereum",
    eth: "ethereum",
    bsc: "binance-smart-chain",
    "binance-smart-chain": "binance-smart-chain",
    bnb: "binance-smart-chain",
    polygon: "polygon-pos",
    matic: "polygon-pos",
    avalanche: "avalanche",
    avax: "avalanche",
    arbitrum: "arbitrum-one",
    optimism: "optimistic-ethereum",
    base: "base",
    solana: "solana",
    sol: "solana",
    fantom: "fantom",
    ftm: "fantom",
    cronos: "cronos",
    cro: "cronos",
    gnosis: "xdai",
    xdai: "xdai",
    zksync: "zksync",
    linea: "linea",
    mantle: "mantle",
    scroll: "scroll",
    blast: "blast",
    ton: "the-open-network",
    tron: "tron",
    near: "near-protocol",
    sui: "sui",
    aptos: "aptos",
  };
  return map[chain.toLowerCase()] ?? null;
}
