import type { SearchResult, LivePrice } from "./types";

const BASE = "https://api.binance.com/api/v3";

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
};

/** Try USDT, then BTC, then ETH quote pairs for the given symbol */
export async function searchBinance(query: string): Promise<SearchResult[]> {
  const sym = query.trim().toUpperCase();
  if (!sym) return [];
  const quotes = ["USDT", "BTC", "ETH"];
  const results: SearchResult[] = [];

  await Promise.all(
    quotes.map(async (quote) => {
      const pair = `${sym}${quote}`;
      try {
        const res = await fetch(`${BASE}/ticker/24hr?symbol=${pair}`, { cache: "no-store" });
        if (!res.ok) return;
        const d: BinanceTicker = await res.json();
        results.push({
          id: pair,
          symbol: sym,
          name: `${sym} / ${quote}`,
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
