import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { runMigrations } from "@/lib/db-migrate";
import { normalizeChain, normalizeContractAddress } from "@/lib/token-identity";
import { authorize } from "@/lib/access-control";

/** All identity + metadata fields returned to callers. */
const SELECT_COLS = `
  id, symbol, label, coingecko_id, image_url, full_name,
  cached_price, cached_change_24h, cached_rank,
  price_source, contract_address, chain, binance_pair, pair_address,
  wallet_source, preferred_exchange, exchange_symbol,
  exchange_symbol_verified_at, created_at
`;

export async function GET() {
  const authorization = await authorize("asset_tracking.view");
  if (authorization.response) return authorization.response;
  try {
    await runMigrations();
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS}
         FROM tracked_tokens
        ORDER BY created_at DESC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("tracked/tokens GET:", err);
    return NextResponse.json({ error: "Failed to fetch tracked tokens" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorize("asset_tracking.manage");
  if (authorization.response) return authorization.response;
  try {
    await runMigrations();
    const body = (await request.json()) as {
      symbol: string; label?: string;
      coingecko_id?: string; image_url?: string; full_name?: string;
      cached_price?: number; cached_change_24h?: number; cached_rank?: number;
      price_source?: string; contract_address?: string; chain?: string;
      binance_pair?: string; pair_address?: string;
      wallet_source?: string;
      preferred_exchange?: string | null; exchange_symbol?: string | null;
    };

    const clean = String(body.symbol ?? "").trim().toUpperCase();
    if (!clean) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

    const chainNorm    = normalizeChain(body.chain);
    const contractNorm = normalizeContractAddress(body.contract_address, chainNorm);
    const cgId         = body.coingecko_id?.trim() ?? null;
    const exchangeSym  = typeof body.exchange_symbol === "string" && body.exchange_symbol.trim()
      ? body.exchange_symbol.trim().toUpperCase()
      : null;
    const preferredExchange = typeof body.preferred_exchange === "string" && body.preferred_exchange.trim()
      ? body.preferred_exchange.trim().toUpperCase()
      : null;
    const hasPreferredExchange = Object.prototype.hasOwnProperty.call(body, "preferred_exchange");
    const hasExchangeSymbol = Object.prototype.hasOwnProperty.call(body, "exchange_symbol");
    if (preferredExchange !== null || exchangeSym !== null) {
      return NextResponse.json(
        { error: "Exchange mappings must be verified after the token is saved." },
        { status: 400 },
      );
    }

    // ── Resolve existing record ──────────────────────────────────────────────
    // Priority: 1) contract+chain, 2) coingecko_id, 3) symbol-only
    let existingId: number | null = null;

    const hasContractIdentity = Boolean(contractNorm && chainNorm);

    if (hasContractIdentity) {
      const { rows } = await pool.query(
        `SELECT id FROM tracked_tokens
          WHERE lower(chain) = $2
            AND (
              CASE
                WHEN lower(chain) IN (
                  'ethereum','eth','base','arbitrum','arbitrum-one','optimism',
                  'optimistic-ethereum','polygon','polygon-pos','matic','bsc','bnb',
                  'binance-smart-chain','avalanche','avax','fantom','ftm','cronos',
                  'cro','gnosis','xdai','zksync','linea','mantle','scroll','blast'
                ) THEN lower(contract_address)
                ELSE contract_address
              END
            ) = $1
          LIMIT 1`,
        [contractNorm, chainNorm]
      );
      if (rows.length) existingId = rows[0].id as number;
    }

    if (existingId === null && cgId && !hasContractIdentity) {
      const { rows } = await pool.query(
        `SELECT id FROM tracked_tokens
          WHERE lower(coingecko_id) = lower($1)
          LIMIT 1`,
        [cgId]
      );
      if (rows.length) existingId = rows[0].id as number;
    }

    if (existingId === null && !hasContractIdentity && !cgId) {
      const { rows } = await pool.query(
        `SELECT id FROM tracked_tokens
          WHERE symbol = $1
            AND contract_address IS NULL
            AND coingecko_id IS NULL
          LIMIT 1`,
        [clean]
      );
      if (rows.length) existingId = rows[0].id as number;
    }

    // ── Update or Insert ─────────────────────────────────────────────────────
    let resultRows: Array<Record<string, unknown>>;

    if (existingId !== null) {
      // UPDATE by primary id – preserves wallet_source merge semantics
      const { rows } = await pool.query(
        `UPDATE tracked_tokens SET
           symbol            = $2,
           label             = COALESCE($3,  label),
           coingecko_id      = COALESCE($4,  coingecko_id),
           image_url         = COALESCE($5,  image_url),
           full_name         = COALESCE($6,  full_name),
           cached_price      = COALESCE($7,  cached_price),
           cached_change_24h = COALESCE($8,  cached_change_24h),
           cached_rank       = COALESCE($9,  cached_rank),
           price_source      = COALESCE($10, price_source),
           contract_address  = COALESCE($11, contract_address),
           chain             = COALESCE($12, chain),
           binance_pair      = COALESCE($13, binance_pair),
           pair_address      = COALESCE($14, pair_address),
           wallet_source     = COALESCE(wallet_source, $15),
           preferred_exchange = CASE WHEN $18::boolean THEN $16::text ELSE preferred_exchange END,
           exchange_symbol   = CASE WHEN $19::boolean THEN $17::text ELSE exchange_symbol END,
           exchange_symbol_verified_at = CASE
             WHEN $19::boolean THEN
               NULL
             ELSE exchange_symbol_verified_at
           END,
           data_updated_at   = NOW()
         WHERE id = $1
         RETURNING ${SELECT_COLS}`,
        [
          existingId,
          clean,
          body.label             ?? null,
          cgId,
          body.image_url         ?? null,
          body.full_name         ?? null,
          body.cached_price      ?? null,
          body.cached_change_24h ?? null,
          body.cached_rank       ?? null,
          body.price_source      ?? null,
          contractNorm,
          chainNorm,
          body.binance_pair      ?? null,
          body.pair_address      ?? null,
          body.wallet_source     ?? null,
          preferredExchange,
          exchangeSym,
          hasPreferredExchange,
          hasExchangeSymbol,
        ]
      );
      resultRows = rows;
    } else {
      // INSERT new record
      const { rows } = await pool.query(
        `INSERT INTO tracked_tokens
           (symbol, label, coingecko_id, image_url, full_name,
            cached_price, cached_change_24h, cached_rank,
            price_source, contract_address, chain, binance_pair, pair_address,
             wallet_source, preferred_exchange, exchange_symbol,
             exchange_symbol_verified_at, data_updated_at)
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::text,$16::text,
            NULL,
            NOW()
          )
         RETURNING ${SELECT_COLS}`,
        [
          clean,
          body.label             ?? null,
          cgId,
          body.image_url         ?? null,
          body.full_name         ?? null,
          body.cached_price      ?? null,
          body.cached_change_24h ?? null,
          body.cached_rank       ?? null,
          body.price_source      ?? null,
          contractNorm,
          chainNorm,
          body.binance_pair      ?? null,
          body.pair_address      ?? null,
          body.wallet_source     ?? null,
          preferredExchange,
          exchangeSym,
        ]
      );
      resultRows = rows;
    }

    if (!resultRows.length) {
      return NextResponse.json({ error: "Failed to upsert token" }, { status: 500 });
    }
    return NextResponse.json(resultRows[0], { status: 201 });
  } catch (err) {
    console.error("tracked/tokens POST:", err);
    return NextResponse.json({ error: "Failed to add token" }, { status: 500 });
  }
}
