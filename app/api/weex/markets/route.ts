import { fetchWeexMarkets, findWeexMarket, normalizeWeexSymbol } from "@/lib/weex-markets";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawSymbol = params.get("symbol");

  try {
    const markets = await fetchWeexMarkets();

    // Exact symbol lookup: ?symbol=BTCUSDT
    if (rawSymbol !== null) {
      const symbol = normalizeWeexSymbol(rawSymbol);
      // Validate pattern strictly — no fuzzy matching
      if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol)) {
        return Response.json(
          { error: "Invalid symbol. Expected normalized format e.g. BTCUSDT." },
          { status: 400 },
        );
      }
      const market = markets.find((m) => m.symbol === symbol);
      if (!market) {
        return Response.json(
          { error: `${symbol} is not available from the connected exchange.`, symbol },
          { status: 404 },
        );
      }
      return Response.json(
        { exchange: "WEEX", marketType: "USDT perpetuals", market },
        { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" } },
      );
    }

    // Full list
    return Response.json(
      { exchange: "WEEX", marketType: "USDT perpetuals", markets },
      { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to reach the WEEX public market feed.";
    return Response.json({ error: message }, { status: 502 });
  }
}

// Re-export for potential use by other routes at build time
export { findWeexMarket };
