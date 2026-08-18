import { NextResponse } from "next/server";

type GeckoSearchCoin = { id: string; symbol: string; name: string; market_cap_rank: number; thumb: string };
type GeckoMarket = { id: string; symbol: string; name: string; current_price: number; price_change_percentage_24h: number; image: string; market_cap_rank: number };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  try {
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { cache: "no-store" }
    );
    if (!searchRes.ok) return NextResponse.json([]);
    const searchJson = (await searchRes.json()) as { coins?: GeckoSearchCoin[] };
    const coins = (searchJson.coins ?? []).slice(0, 8);
    if (!coins.length) return NextResponse.json([]);

    const ids = coins.map(c => c.id).join(",");
    const marketsRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=8&page=1`,
      { cache: "no-store" }
    );
    const markets: GeckoMarket[] = marketsRes.ok ? (await marketsRes.json()) : [];
    const marketMap = new Map(markets.map(m => [m.id, m]));

    const result = coins.map(c => {
      const m = marketMap.get(c.id);
      return {
        id: c.id,
        symbol: (m?.symbol ?? c.symbol).toUpperCase(),
        name: m?.name ?? c.name,
        priceUsd: String(m?.current_price ?? 0),
        changePercent24Hr: String(m?.price_change_percentage_24h ?? 0),
        rank: String(m?.market_cap_rank ?? c.market_cap_rank ?? 0),
        image: m?.image ?? c.thumb,
      };
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json([]);
  }
}
