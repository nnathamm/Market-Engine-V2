import {
  fetchWeexMarkets,
  findWeexMarket,
  fetchCoinGeckoById,
  fetchCoinGeckoByContract,
  extractWeexUsdtTicker,
  findCorroboratedWeexMarket,
  extractWeexNonUsdtTickers,
  normalizeWeexSymbol,
  isValidWeexSymbol,
  type WeexMarket,
} from "@/lib/weex-markets";
import pool from "@/lib/db";
import { runMigrations } from "@/lib/db-migrate";
import { authorize } from "@/lib/access-control";

/**
 * GET /api/weex/resolve
 *
 * Query parameters (all optional, used in strict priority order):
 *   exchangeSymbol    – a previously-saved validated WEEX symbol (e.g. BTCUSDT)
 *   symbol            – a plain token symbol (e.g. BTC). Used only as last resort.
 *   chain             – blockchain identifier (e.g. ethereum, bsc)
 *   contractAddress   – on-chain contract address
 *   coingeckoId       – CoinGecko coin id (e.g. bitcoin)
 *
 * Resolution order (strictly sequential, never falls back to a weaker method
 * once a strong identity has been established):
 *   1. exchangeSymbol  → exact validated WEEX symbol lookup
 *   2. chain + contractAddress → CoinGecko exact coin → verify WEEX ticker
 *   3. coingeckoId → CoinGecko coin detail → verify WEEX ticker
 *   4. symbol → exact SYMBOLUSDT fallback ONLY when no strong identity was supplied
 *
 * Returns one of:
 *   { resolved: WeexMarket }            – market found
 *   { unavailable: string, alternatives?: string[] }  – known token but no USDT perp
 *   { error: string }                   – bad request
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let exchangeSymbol = params.get("exchangeSymbol")?.trim() ?? null;
  let symbol = params.get("symbol")?.trim().toUpperCase() ?? null;
  let chain = params.get("chain")?.trim() ?? null;
  let contractAddress = params.get("contractAddress")?.trim() ?? null;
  let coingeckoId = params.get("coingeckoId")?.trim() ?? null;
  const tokenIdParam = params.get("tokenId");

  if (tokenIdParam !== null) {
    const authorization = await authorize("asset_tracking.view");
    if (authorization.response) return authorization.response;
    const tokenId = Number(tokenIdParam);
    if (!Number.isInteger(tokenId) || tokenId <= 0) {
      return Response.json({ error: "tokenId must be a positive integer." }, { status: 400 });
    }
    try {
      await runMigrations();
      const { rows } = await pool.query(
        `SELECT symbol, chain, contract_address, coingecko_id,
                preferred_exchange, exchange_symbol, exchange_symbol_verified_at
           FROM tracked_tokens
          WHERE id = $1`,
        [tokenId],
      );
      if (!rows.length) {
        return Response.json({ error: "Tracked token not found." }, { status: 404 });
      }
      const tracked = rows[0];
      symbol = tracked.symbol;
      chain = tracked.chain;
      contractAddress = tracked.contract_address;
      coingeckoId = tracked.coingecko_id;
      exchangeSymbol = (
        tracked.exchange_symbol_verified_at
        && String(tracked.preferred_exchange ?? "").toUpperCase() === "WEEX"
      )
        ? tracked.exchange_symbol
        : null;
    } catch (error) {
      console.error("weex/resolve tracked identity:", error);
      return Response.json({ error: "Unable to load the tracked token identity." }, { status: 500 });
    }
  }

  // Must supply at least one parameter
  if (!exchangeSymbol && !symbol && !chain && !contractAddress && !coingeckoId) {
    return Response.json(
      { error: "Supply at least one of: exchangeSymbol, symbol, chain+contractAddress, coingeckoId." },
      { status: 400 },
    );
  }

  // Fetch all markets once — shared across all resolution paths
  let markets: WeexMarket[];
  try {
    markets = await fetchWeexMarkets();
  } catch {
    return Response.json(
      { error: "WEEX market data is temporarily unavailable." },
      { status: 502 },
    );
  }

  const cacheHeaders = { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" };
  const hasContractIdentity = Boolean(chain && contractAddress);
  const hasStrongIdentity = Boolean(exchangeSymbol || hasContractIdentity || coingeckoId);
  let verifiedDisplaySymbol = symbol;
  let verifiedAlternatives: string[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Validated saved exchange symbol — exact match only
  // -------------------------------------------------------------------------
  if (exchangeSymbol !== null) {
    const normalized = normalizeWeexSymbol(exchangeSymbol);
    if (!isValidWeexSymbol(normalized)) {
      if (!hasContractIdentity && !coingeckoId) {
        return Response.json(
          { error: `Invalid exchangeSymbol '${exchangeSymbol}'. Expected format: e.g. BTCUSDT.` },
          { status: 400 },
        );
      }
    } else {
      const market = markets.find((m) => m.symbol === normalized);
      if (market) {
        return Response.json({ resolved: market }, { headers: cacheHeaders });
      }
      verifiedDisplaySymbol = normalized.replace(/USDT$/, "");
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: chain + contractAddress → CoinGecko exact coin → verify WEEX ticker
  // -------------------------------------------------------------------------
  if (chain && contractAddress) {
    const coin = await fetchCoinGeckoByContract(chain, contractAddress);
    if (coin) {
      const weexTicker = extractWeexUsdtTicker(coin);
      if (weexTicker) {
        const market = markets.find((m) => m.symbol === weexTicker.weexSymbol);
        if (market) {
          return Response.json({ resolved: market }, { headers: cacheHeaders });
        }
      }
      const corroboratedMarket = findCorroboratedWeexMarket(coin, markets);
      if (corroboratedMarket) {
        return Response.json({ resolved: corroboratedMarket }, { headers: cacheHeaders });
      }
      // CoinGecko confirms the coin but no WEEX USDT perp found
      verifiedAlternatives = extractWeexNonUsdtTickers(coin);
      verifiedDisplaySymbol = coin.symbol.toUpperCase();
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: coingeckoId → CoinGecko coin detail → verify WEEX ticker
  // -------------------------------------------------------------------------
  if (coingeckoId) {
    const coin = await fetchCoinGeckoById(coingeckoId);
    if (coin) {
      const weexTicker = extractWeexUsdtTicker(coin);
      if (weexTicker) {
        const market = markets.find((m) => m.symbol === weexTicker.weexSymbol);
        if (market) {
          return Response.json({ resolved: market }, { headers: cacheHeaders });
        }
      }
      const corroboratedMarket = findCorroboratedWeexMarket(coin, markets);
      if (corroboratedMarket) {
        return Response.json({ resolved: corroboratedMarket }, { headers: cacheHeaders });
      }
      verifiedAlternatives = extractWeexNonUsdtTickers(coin);
      verifiedDisplaySymbol = coin.symbol.toUpperCase();
    }
  }

  if (hasStrongIdentity) {
    const displayToken = verifiedDisplaySymbol ? `${verifiedDisplaySymbol}/USDT` : "This token/USDT";
    return Response.json(
      {
        unavailable: `${displayToken} is not available from the connected exchange.`,
        ...(verifiedAlternatives.length ? { alternatives: verifiedAlternatives } : {}),
      },
      { headers: cacheHeaders },
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Plain symbol fallback — only when NO strong identity was provided
  // -------------------------------------------------------------------------
  if (symbol) {
    const candidate = `${symbol}USDT`;
    if (!isValidWeexSymbol(candidate)) {
      return Response.json(
        { error: `Invalid symbol '${symbol}'. Must be 2-24 uppercase alphanumeric characters.` },
        { status: 400 },
      );
    }
    const market = markets.find((m) => m.symbol === candidate);
    if (market) {
      return Response.json({ resolved: market }, { headers: cacheHeaders });
    }
    return Response.json(
      {
        unavailable: `${symbol}/USDT is not available from the connected exchange.`,
      },
      { headers: cacheHeaders },
    );
  }

  // Should be unreachable given the guard at the top, but satisfies TypeScript
  return Response.json(
    { error: "No resolvable identity provided." },
    { status: 400 },
  );
}
