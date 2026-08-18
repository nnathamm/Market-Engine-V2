import type { SearchResult, LivePrice } from "./types";

const BASE = "https://api.dexscreener.com/latest/dex";

type DexPair = {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  info?: { imageUrl?: string };
};

export async function searchDexScreener(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `${BASE}/search?q=${encodeURIComponent(query.trim())}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { pairs?: DexPair[] };
    const pairs = data.pairs ?? [];

    // Deduplicate by base token address, keep highest liquidity pair
    const byAddress = new Map<string, DexPair>();
    for (const p of pairs) {
      if (!p.priceUsd || !p.baseToken?.address) continue;
      const key = `${p.chainId}:${p.baseToken.address}`;
      const existing = byAddress.get(key);
      const liq = p.liquidity?.usd ?? 0;
      const existingLiq = existing?.liquidity?.usd ?? 0;
      if (!existing || liq > existingLiq) byAddress.set(key, p);
    }

    return Array.from(byAddress.values())
      .slice(0, 6)
      .map(p => ({
        id: `${p.chainId}:${p.pairAddress}`,
        symbol: p.baseToken.symbol.toUpperCase(),
        name: p.baseToken.name,
        priceUsd: p.priceUsd ?? "0",
        changePercent24Hr: String(p.priceChange?.h24 ?? 0),
        rank: "0",
        image: p.info?.imageUrl,
        source: "dexscreener" as const,
        contractAddress: p.baseToken.address,
        chain: p.chainId,
        pairAddress: p.pairAddress,
      }));
  } catch {
    return [];
  }
}

export async function getPriceDexScreener(chain: string, pairAddress: string): Promise<LivePrice | null> {
  try {
    const res = await fetch(`${BASE}/pairs/${chain}/${pairAddress}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: DexPair[] };
    const pair = data.pairs?.[0];
    if (!pair?.priceUsd) return null;
    return {
      priceUsd: parseFloat(pair.priceUsd),
      changePercent24Hr: Number(pair.priceChange?.h24 ?? 0),
      image: pair.info?.imageUrl,
      source: "dexscreener",
    };
  } catch {
    return null;
  }
}
