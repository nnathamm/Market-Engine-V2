import { NextResponse } from "next/server";
import { fetchLivePrices } from "@/lib/price-sources";
import type { TokenInput } from "@/lib/price-sources/types";

export async function POST(request: Request) {
  try {
    const { tokens } = (await request.json()) as { tokens: TokenInput[] };
    if (!Array.isArray(tokens) || !tokens.length) return NextResponse.json({});
    const prices = await fetchLivePrices(tokens);
    return NextResponse.json(prices);
  } catch (err) {
    console.error("coins/live-prices POST:", err);
    return NextResponse.json({});
  }
}
