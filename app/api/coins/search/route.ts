import { NextResponse } from "next/server";

type CoinCapAsset = {
  id: string;
  symbol: string;
  name: string;
  priceUsd: string;
  changePercent24Hr: string;
  rank: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://api.coincap.io/v2/assets?search=${encodeURIComponent(query)}&limit=8`,
      { next: { revalidate: 30 } }
    );
    const json = (await res.json()) as { data?: CoinCapAsset[] };
    return NextResponse.json(json.data ?? []);
  } catch {
    return NextResponse.json([]);
  }
}
