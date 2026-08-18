import type { SearchResult, LivePrice, TokenInput } from "./types";
import { searchCoingecko, getPricesCoingecko } from "./coingecko";
import { searchBinance, getPriceBinance } from "./binance";
import { searchDexScreener, getPriceDexScreener } from "./dexscreener";
import { searchGeckoTerminal, getPriceGeckoTerminal } from "./geckoterminal";

export type { SearchResult, LivePrice, TokenInput };

/**
 * Cascade search: CoinGecko → Binance → DEX Screener → GeckoTerminal.
 * Returns up to 8 results, labeled by source.
 */
export async function cascadeSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // 1. CoinGecko first
  const geckoResults = await searchCoingecko(q);
  if (geckoResults.length >= 3) return geckoResults.slice(0, 8);

  const seen = new Set(geckoResults.map(r => r.symbol.toUpperCase()));
  const merged: SearchResult[] = [...geckoResults];

  // 2. Binance + DEX Screener in parallel (fast)
  const [binanceResults, dexResults] = await Promise.all([
    searchBinance(q),
    searchDexScreener(q),
  ]);

  for (const r of binanceResults) {
    if (!seen.has(r.symbol.toUpperCase())) {
      merged.push(r);
      seen.add(r.symbol.toUpperCase());
    }
  }
  for (const r of dexResults) {
    // DEX can have many pairs for the same symbol — allow a few
    const count = merged.filter(m => m.symbol.toUpperCase() === r.symbol.toUpperCase()).length;
    if (count < 2) {
      merged.push(r);
      seen.add(r.symbol.toUpperCase());
    }
  }

  if (merged.length >= 3) return merged.slice(0, 8);

  // 3. GeckoTerminal as last resort (10 req/min — only hit when truly needed)
  const gtResults = await searchGeckoTerminal(q);
  for (const r of gtResults) {
    const count = merged.filter(m => m.symbol.toUpperCase() === r.symbol.toUpperCase()).length;
    if (count < 2) merged.push(r);
  }

  return merged.slice(0, 8);
}

/**
 * Batch-fetch live prices for a list of tracked tokens.
 * Groups by price_source and calls the appropriate provider.
 * Returns a map keyed by token symbol.
 */
export async function fetchLivePrices(tokens: TokenInput[]): Promise<Record<string, LivePrice>> {
  const result: Record<string, LivePrice> = {};

  const geckoTokens  = tokens.filter(t => t.price_source === "coingecko"     && t.coingecko_id);
  const binanceTokens = tokens.filter(t => t.price_source === "binance"       && t.binance_pair);
  const dexTokens     = tokens.filter(t => t.price_source === "dexscreener"   && t.chain && t.pair_address);
  const gtTokens      = tokens.filter(t => t.price_source === "geckoterminal" && t.chain && t.pair_address);

  // Batch CoinGecko (single request for all ids)
  if (geckoTokens.length) {
    const ids = geckoTokens.map(t => t.coingecko_id!);
    const prices = await getPricesCoingecko(ids);
    for (const t of geckoTokens) {
      const p = prices.get(t.coingecko_id!);
      if (p) result[t.symbol] = p;
    }
  }

  // Individual calls in parallel for the remaining sources
  await Promise.all([
    ...binanceTokens.map(async t => {
      const p = await getPriceBinance(t.binance_pair!);
      if (p) result[t.symbol] = p;
    }),
    ...dexTokens.map(async t => {
      const p = await getPriceDexScreener(t.chain!, t.pair_address!);
      if (p) result[t.symbol] = p;
    }),
    ...gtTokens.map(async t => {
      const p = await getPriceGeckoTerminal(t.chain!, t.pair_address!);
      if (p) result[t.symbol] = p;
    }),
  ]);

  return result;
}
