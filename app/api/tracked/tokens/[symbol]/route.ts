import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { runMigrations } from "@/lib/db-migrate";
import { normalizeChain, normalizeContractAddress } from "@/lib/token-identity";
import { verifyWeexMarketForTokenIdentity } from "@/lib/weex-markets";

/** All identity + metadata fields returned to callers. */
const SELECT_COLS = `
  id, symbol, label, coingecko_id, image_url, full_name,
  cached_price, cached_change_24h, cached_rank,
  price_source, contract_address, chain, binance_pair, pair_address,
  wallet_source, preferred_exchange, exchange_symbol,
  exchange_symbol_verified_at, created_at
`;

/**
 * Resolve a route param to a single row id.
 *
 * - If the param is a plain integer string → use it as numeric primary id.
 * - Otherwise treat it as a symbol.  If the symbol matches exactly one row,
 *   return that id.  If it matches multiple rows (allowed since the
 *   symbol-only unique constraint was dropped), return null with a 409 hint.
 *
 * Returns { id, status } where status is:
 *   "found"     – exactly one row, id is valid
 *   "not_found" – no row matched
 *   "ambiguous" – symbol matched >1 rows (only possible for symbol lookup)
 */
async function resolveParam(
  param: string
): Promise<
  | { status: "found"; id: number }
  | { status: "not_found" }
  | { status: "ambiguous"; count: number }
> {
  const asNum = Number(param);
  if (Number.isInteger(asNum) && asNum > 0 && String(asNum) === param) {
    // Numeric id path
    const { rows } = await pool.query(
      "SELECT id FROM tracked_tokens WHERE id = $1",
      [asNum]
    );
    if (rows.length) return { status: "found", id: asNum };
    return { status: "not_found" };
  }

  // Symbol path – must be unambiguous
  const sym = param.toUpperCase();
  const { rows } = await pool.query(
    "SELECT id FROM tracked_tokens WHERE symbol = $1",
    [sym]
  );
  if (rows.length === 0) return { status: "not_found" };
  if (rows.length > 1) return { status: "ambiguous", count: rows.length };
  return { status: "found", id: rows[0].id as number };
}

// ── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await runMigrations();
    const { symbol: param } = await params;
    const resolved = await resolveParam(param);

    if (resolved.status === "not_found") {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (resolved.status === "ambiguous") {
      return NextResponse.json(
        {
          error: `Symbol '${param.toUpperCase()}' matches ${resolved.count} records. Use the numeric id instead.`,
        },
        { status: 409 }
      );
    }

    await pool.query("DELETE FROM tracked_tokens WHERE id = $1", [resolved.id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tracked/tokens DELETE:", err);
    return NextResponse.json({ error: "Failed to remove token" }, { status: 500 });
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await runMigrations();
    const { symbol: param } = await params;
    const resolved = await resolveParam(param);

    if (resolved.status === "not_found") {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (resolved.status === "ambiguous") {
      return NextResponse.json(
        {
          error: `Symbol '${param.toUpperCase()}' matches ${resolved.count} records. Use the numeric id instead.`,
        },
        { status: 409 }
      );
    }

    const body = (await req.json()) as {
      label?: string;
      coingecko_id?: string; image_url?: string; full_name?: string;
      cached_price?: number; cached_change_24h?: number; cached_rank?: number;
      price_source?: string; contract_address?: string; chain?: string;
      binance_pair?: string; pair_address?: string;
      preferred_exchange?: string | null; exchange_symbol?: string | null;
    };

    // Normalise exchange_symbol to uppercase if supplied
    const exchangeSym = typeof body.exchange_symbol === "string" && body.exchange_symbol.trim()
      ? body.exchange_symbol.trim().toUpperCase()
      : null;
    const preferredExchange = typeof body.preferred_exchange === "string" && body.preferred_exchange.trim()
      ? body.preferred_exchange.trim().toUpperCase()
      : null;
    const hasPreferredExchange = Object.prototype.hasOwnProperty.call(body, "preferred_exchange");
    const hasExchangeSymbol = Object.prototype.hasOwnProperty.call(body, "exchange_symbol");
    const current = await pool.query(
      `SELECT symbol, chain, contract_address, coingecko_id
         FROM tracked_tokens
        WHERE id = $1`,
      [resolved.id],
    );
    const currentToken = current.rows[0] as {
      symbol: string;
      chain: string | null;
      contract_address: string | null;
      coingecko_id: string | null;
    };
    const chainNorm = normalizeChain(body.chain ?? current.rows[0]?.chain);
    const contractNorm = body.contract_address === undefined
      ? null
      : normalizeContractAddress(body.contract_address, chainNorm);
    let verifiedExchangeUpdate = false;
    if (preferredExchange !== null || exchangeSym !== null) {
      if (preferredExchange !== "WEEX" || exchangeSym === null) {
        return NextResponse.json(
          { error: "A WEEX exchange symbol is required for a saved exchange mapping." },
          { status: 400 },
        );
      }
      const verified = await verifyWeexMarketForTokenIdentity({
        expectedExchangeSymbol: exchangeSym,
        symbol: currentToken.symbol,
        chain: body.chain === undefined ? currentToken.chain : chainNorm,
        contractAddress: body.contract_address === undefined
          ? currentToken.contract_address
          : contractNorm,
        coingeckoId: body.coingecko_id === undefined
          ? currentToken.coingecko_id
          : body.coingecko_id,
      });
      if (!verified) {
        return NextResponse.json(
          { error: "The requested WEEX market does not match this token identity." },
          { status: 422 },
        );
      }
      verifiedExchangeUpdate = true;
    }

    const { rows } = await pool.query(
      `UPDATE tracked_tokens SET
         coingecko_id       = COALESCE($2,  coingecko_id),
         image_url          = COALESCE($3,  image_url),
         full_name          = COALESCE($4,  full_name),
         cached_price       = COALESCE($5,  cached_price),
         cached_change_24h  = COALESCE($6,  cached_change_24h),
         cached_rank        = COALESCE($7,  cached_rank),
         price_source       = COALESCE($8,  price_source),
         contract_address   = COALESCE($9,  contract_address),
         chain              = COALESCE($10, chain),
         binance_pair       = COALESCE($11, binance_pair),
         pair_address       = COALESCE($12, pair_address),
         preferred_exchange = CASE WHEN $16::boolean THEN $13::text ELSE preferred_exchange END,
         exchange_symbol    = CASE WHEN $17::boolean THEN $14::text ELSE exchange_symbol END,
         exchange_symbol_verified_at = CASE
           WHEN $17::boolean THEN
             CASE WHEN $18::boolean THEN NOW() ELSE NULL END
           ELSE exchange_symbol_verified_at
         END,
         label              = COALESCE($15, label),
         data_updated_at    = NOW()
       WHERE id = $1
       RETURNING ${SELECT_COLS}`,
      [
        resolved.id,
        body.coingecko_id      ?? null,
        body.image_url         ?? null,
        body.full_name         ?? null,
        body.cached_price      ?? null,
        body.cached_change_24h ?? null,
        body.cached_rank       ?? null,
        body.price_source      ?? null,
        contractNorm,
        body.chain === undefined ? null : chainNorm,
        body.binance_pair      ?? null,
        body.pair_address      ?? null,
        preferredExchange,
        exchangeSym,
        body.label ?? null,
        hasPreferredExchange,
        hasExchangeSymbol,
        verifiedExchangeUpdate,
      ]
    );

    if (!rows.length) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("tracked/tokens PATCH:", err);
    return NextResponse.json({ error: "Failed to update token" }, { status: 500 });
  }
}
