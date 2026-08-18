import type { SearchResult, LivePrice } from "./types";

const BASE = "https://api.binance.com/api/v3";

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
};

const KNOWN_QUOTES = ["USDT", "BTC", "ETH", "BNB", "BUSD"];

/**
 * Try the query as a direct Binance pair first (handles "EDENUSDT", "BTCUSDT", etc.),
 * then try appending USDT / BTC / ETH if the query looks like a base symbol.
 */
export async function searchBinance(query: string): Promise<SearchResult[]> {
  const raw = query.trim().toUpperCase();
  if (!raw) return [];

  // Determine which pairs to probe
  const pairsToTry = new Set<string>();

  // If the query already ends with a known quote (e.g. "EDENUSDT"), try it directly
  const matchedQuote = KNOWN_QUOTES.find(q => raw.endsWith(q) && raw.length > q.length);
  if (matchedQuote) {
    pairsToTry.add(raw); // e.g. "EDENUSDT"
  } else {
    // Treat query as a base symbol and append quotes
    for (const q of ["USDT", "BTC", "ETH"]) pairsToTry.add(`${raw}${q}`);
  }

  const results: SearchResult[] = [];

  await Promise.all(
    Array.from(pairsToTry).map(async (pair) => {
      try {
        const res = await fetch(`${BASE}/ticker/24hr?symbol=${pair}`, { cache: "no-store" });
        if (!res.ok) return;
        const d: BinanceTicker = await res.json();
        // Extract the base symbol: strip the matched quote suffix
        const quote = KNOWN_QUOTES.find(q => pair.endsWith(q)) ?? "USDT";
        const baseSym = pair.slice(0, pair.length - quote.length);
        results.push({
          id: pair,
          symbol: baseSym,
          name: `${baseSym} / ${quote}`,
          priceUsd: d.lastPrice,
          changePercent24Hr: d.priceChangePercent,
          rank: "0",
          source: "binance",
          binancePair: pair,
        });
      } catch { /* not listed */ }
    })
  );

  // Sort: USDT first, then BTC, then ETH
  results.sort((a, b) => {
    const order = ["USDT", "BTC", "ETH"];
    const ai = order.findIndex(q => a.binancePair?.endsWith(q));
    const bi = order.findIndex(q => b.binancePair?.endsWith(q));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return results;
}

export async function getPriceBinance(pair: string): Promise<LivePrice | null> {
  try {
    const res = await fetch(`${BASE}/ticker/24hr?symbol=${pair}`, { cache: "no-store" });
    if (!res.ok) return null;
    const d: BinanceTicker = await res.json();
    return {
      priceUsd: parseFloat(d.lastPrice),
      changePercent24Hr: parseFloat(d.priceChangePercent),
      source: "binance",
    };
  } catch {
    return null;
  }
}
