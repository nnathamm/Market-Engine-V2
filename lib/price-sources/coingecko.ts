import type { SearchResult, LivePrice } from "./types";

const BASE = "https://api.coingecko.com/api/v3";

type GeckoSearchCoin = { id: string; symbol: string; name: string; market_cap_rank: number; thumb: string };
type GeckoMarket = {
  id: string; symbol: string; name: string;
  current_price: number; price_change_percentage_24h: number;
  image: string; market_cap_rank: number;
};

export async function searchCoingecko(query: string): Promise<SearchResult[]> {
  try {
    const searchRes = await fetch(`${BASE}/search?query=${encodeURIComponent(query)}`, { cache: "no-store" });
    if (!searchRes.ok) return [];
    const { coins = [] } = (await searchRes.json()) as { coins?: GeckoSearchCoin[] };
    const top = coins.slice(0, 8);
    if (!top.length) return [];

    const ids = top.map(c => c.id).join(",");
    const marketsRes = await fetch(
      `${BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=8&page=1`,
      { cache: "no-store" }
    );
    const markets: GeckoMarket[] = marketsRes.ok ? await marketsRes.json() : [];
    const mm = new Map(markets.map(m => [m.id, m]));

    return top.map(c => {
      const m = mm.get(c.id);
      return {
        id: c.id,
        symbol: (m?.symbol ?? c.symbol).toUpperCase(),
        name: m?.name ?? c.name,
        priceUsd: String(m?.current_price ?? 0),
        changePercent24Hr: String(m?.price_change_percentage_24h ?? 0),
        rank: String(m?.market_cap_rank ?? c.market_cap_rank ?? 0),
        image: m?.image ?? c.thumb,
        source: "coingecko" as const,
      };
    }).sort((a, b) => {
      // Coins with a real market cap rank sort first (ascending = most dominant first).
      // Unranked coins (rank "0") go to the bottom.
      const ra = parseInt(a.rank) || 999_999;
      const rb = parseInt(b.rank) || 999_999;
      return ra - rb;
    });
  } catch {
    return [];
  }
}

export async function getPricesCoingecko(ids: string[]): Promise<Map<string, LivePrice>> {
  const result = new Map<string, LivePrice>();
  if (!ids.length) return result;
  try {
    const res = await fetch(
      `${BASE}/coins/markets?vs_currency=usd&ids=${ids.join(",")}&order=market_cap_desc&per_page=50&page=1`,
      { cache: "no-store" }
    );
    if (!res.ok) return result;
    const data: GeckoMarket[] = await res.json();
    for (const m of data) {
      result.set(m.id, {
        priceUsd: m.current_price,
        changePercent24Hr: m.price_change_percentage_24h ?? 0,
        rank: m.market_cap_rank,
        image: m.image,
        name: m.name,
        source: "coingecko",
      });
    }
  } catch { /* ignore */ }
  return result;
}
