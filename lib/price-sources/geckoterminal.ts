import type { SearchResult, LivePrice } from "./types";

const BASE = "https://api.geckoterminal.com/api/v2";

type GTPool = {
  id: string;
  attributes: {
    name: string;
    base_token_price_usd?: string;
    price_change_percentage?: { h24?: number };
    pool_created_at?: string;
  };
  relationships: {
    base_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
};

export async function searchGeckoTerminal(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `${BASE}/search/pools?query=${encodeURIComponent(query.trim())}&page=1`,
      { cache: "no-store", headers: { Accept: "application/json;version=20230302" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: GTPool[] };
    const pools = data.data ?? [];

    // Deduplicate by base token id
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const pool of pools) {
      if (!pool.attributes.base_token_price_usd) continue;
      const baseId = pool.relationships.base_token?.data?.id ?? "";
      if (seen.has(baseId)) continue;
      seen.add(baseId);

      // pool id format: "{network}_{pool_address}"
      const [network, ...rest] = pool.id.split("_");
      const poolAddress = rest.join("_");
      // base token id format: "{network}_{contract_address}"
      const [, ...contractParts] = baseId.split("_");
      const contractAddress = contractParts.join("_");

      // Extract symbol from pool name like "BLESS / SOL"
      const symbol = (pool.attributes.name.split("/")[0] ?? "").trim().toUpperCase();

      results.push({
        id: pool.id,
        symbol,
        name: pool.attributes.name,
        priceUsd: pool.attributes.base_token_price_usd,
        changePercent24Hr: String(pool.attributes.price_change_percentage?.h24 ?? 0),
        rank: "0",
        source: "geckoterminal" as const,
        contractAddress,
        chain: network,
        pairAddress: poolAddress,
      });

      if (results.length >= 5) break;
    }

    return results;
  } catch {
    return [];
  }
}

export async function getPriceGeckoTerminal(network: string, poolAddress: string): Promise<LivePrice | null> {
  try {
    const res = await fetch(
      `${BASE}/networks/${network}/pools/${poolAddress}`,
      { cache: "no-store", headers: { Accept: "application/json;version=20230302" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: GTPool };
    const pool = data.data;
    if (!pool?.attributes.base_token_price_usd) return null;
    return {
      priceUsd: parseFloat(pool.attributes.base_token_price_usd),
      changePercent24Hr: pool.attributes.price_change_percentage?.h24 ?? 0,
      source: "geckoterminal",
    };
  } catch {
    return null;
  }
}
