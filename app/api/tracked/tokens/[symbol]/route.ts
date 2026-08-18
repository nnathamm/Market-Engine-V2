import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    await pool.query("DELETE FROM tracked_tokens WHERE symbol = $1", [symbol.toUpperCase()]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tracked/tokens DELETE:", err);
    return NextResponse.json({ error: "Failed to remove token" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    const body = (await req.json()) as {
      coingecko_id?: string; image_url?: string; full_name?: string;
      cached_price?: number; cached_change_24h?: number; cached_rank?: number;
      price_source?: string; contract_address?: string; chain?: string;
      binance_pair?: string; pair_address?: string;
    };
    const { rows } = await pool.query(
      `UPDATE tracked_tokens SET
         coingecko_id      = COALESCE($2,  coingecko_id),
         image_url         = COALESCE($3,  image_url),
         full_name         = COALESCE($4,  full_name),
         cached_price      = COALESCE($5,  cached_price),
         cached_change_24h = COALESCE($6,  cached_change_24h),
         cached_rank       = COALESCE($7,  cached_rank),
         price_source      = COALESCE($8,  price_source),
         contract_address  = COALESCE($9,  contract_address),
         chain             = COALESCE($10, chain),
         binance_pair      = COALESCE($11, binance_pair),
         pair_address      = COALESCE($12, pair_address),
         data_updated_at   = NOW()
       WHERE symbol = $1
       RETURNING *`,
      [
        symbol.toUpperCase(),
        body.coingecko_id      ?? null,
        body.image_url         ?? null,
        body.full_name         ?? null,
        body.cached_price      ?? null,
        body.cached_change_24h ?? null,
        body.cached_rank       ?? null,
        body.price_source      ?? null,
        body.contract_address  ?? null,
        body.chain             ?? null,
        body.binance_pair      ?? null,
        body.pair_address      ?? null,
      ]
    );
    if (!rows.length) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("tracked/tokens PATCH:", err);
    return NextResponse.json({ error: "Failed to update token" }, { status: 500 });
  }
}
