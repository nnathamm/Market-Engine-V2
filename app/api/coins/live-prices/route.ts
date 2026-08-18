import { NextResponse } from "next/server";
import { fetchLivePrices } from "@/lib/price-sources";
import type { TokenInput } from "@/lib/price-sources/types";
import pool from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { tokens } = (await request.json()) as { tokens: TokenInput[] };
    if (!Array.isArray(tokens) || !tokens.length) return NextResponse.json({});
    const prices = await fetchLivePrices(tokens);

    // Write fresh prices back to the DB cache for every token that got a live result.
    const symbols = Object.keys(prices);
    if (symbols.length > 0) {
      // Build parallel arrays for a single multi-row UPDATE using unnest.
      const syms: string[] = [];
      const priceVals: (number | null)[] = [];
      const changeVals: (number | null)[] = [];

      for (const sym of symbols) {
        const p = prices[sym];
        syms.push(sym);
        priceVals.push(p.priceUsd ?? null);
        changeVals.push(p.changePercent24Hr ?? null);
      }

      await pool.query(
        `UPDATE tracked_tokens AS t
            SET cached_price      = v.price::numeric,
                cached_change_24h = v.change24h::numeric,
                data_updated_at   = NOW()
           FROM (
             SELECT unnest($1::text[])    AS symbol,
                    unnest($2::numeric[]) AS price,
                    unnest($3::numeric[]) AS change24h
           ) AS v
          WHERE t.symbol = v.symbol`,
        [syms, priceVals, changeVals]
      );
    }

    return NextResponse.json(prices);
  } catch (err) {
    console.error("coins/live-prices POST:", err);
    return NextResponse.json({});
  }
}
