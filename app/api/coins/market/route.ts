import { NextResponse } from "next/server";

type GeckoMarket = {
  id: string; symbol: string; name: string;
  current_price: number; price_change_percentage_24h: number;
  image: string; market_cap_rank: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids") ?? "";
  if (!ids.trim()) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=50&page=1`,
      { cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = (await res.json()) as GeckoMarket[];
    return NextResponse.json(data.map(m => ({
      id: m.id,
      symbol: m.symbol.toUpperCase(),
      name: m.name,
      priceUsd: m.current_price,
      changePercent24Hr: m.price_change_percentage_24h ?? 0,
      rank: m.market_cap_rank,
      image: m.image,
    })));
  } catch {
    return NextResponse.json([]);
  }
}
