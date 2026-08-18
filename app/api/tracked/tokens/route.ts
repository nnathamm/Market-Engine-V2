import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT id, symbol, label, coingecko_id, image_url, full_name, cached_price, cached_change_24h, cached_rank, created_at FROM tracked_tokens ORDER BY created_at DESC"
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("tracked/tokens GET:", err);
    return NextResponse.json({ error: "Failed to fetch tracked tokens" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { symbol, label, coingecko_id, image_url, full_name, cached_price, cached_change_24h, cached_rank } =
      (await request.json()) as {
        symbol: string; label?: string; coingecko_id?: string; image_url?: string;
        full_name?: string; cached_price?: number; cached_change_24h?: number; cached_rank?: number;
      };
    const clean = String(symbol ?? "").trim().toUpperCase();
    if (!clean) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    const { rows } = await pool.query(
      `INSERT INTO tracked_tokens
         (symbol, label, coingecko_id, image_url, full_name, cached_price, cached_change_24h, cached_rank, data_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (symbol) DO UPDATE SET
         label            = COALESCE(EXCLUDED.label,            tracked_tokens.label),
         coingecko_id     = COALESCE(EXCLUDED.coingecko_id,     tracked_tokens.coingecko_id),
         image_url        = COALESCE(EXCLUDED.image_url,        tracked_tokens.image_url),
         full_name        = COALESCE(EXCLUDED.full_name,        tracked_tokens.full_name),
         cached_price     = COALESCE(EXCLUDED.cached_price,     tracked_tokens.cached_price),
         cached_change_24h= COALESCE(EXCLUDED.cached_change_24h,tracked_tokens.cached_change_24h),
         cached_rank      = COALESCE(EXCLUDED.cached_rank,      tracked_tokens.cached_rank),
         data_updated_at  = NOW()
       RETURNING *`,
      [clean, label ?? null, coingecko_id ?? null, image_url ?? null, full_name ?? null,
       cached_price ?? null, cached_change_24h ?? null, cached_rank ?? null]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("tracked/tokens POST:", err);
    return NextResponse.json({ error: "Failed to add token" }, { status: 500 });
  }
}
