const BINANCE_MARKET_DATA = "https://api.binance.us";

type BinanceSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
};

type BinanceTicker = {
  symbol: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
};

export async function GET() {
  try {
    const signal = AbortSignal.timeout(8_000);
    const [exchangeResponse, tickerResponse] = await Promise.all([
      fetch(`${BINANCE_MARKET_DATA}/api/v3/exchangeInfo`, { headers: { accept: "application/json" }, signal }),
      fetch(`${BINANCE_MARKET_DATA}/api/v3/ticker/24hr?type=MINI`, { headers: { accept: "application/json" }, signal }),
    ]);

    if (!exchangeResponse.ok || !tickerResponse.ok) {
      throw new Error(`Binance returned ${exchangeResponse.status}/${tickerResponse.status}`);
    }

    const [exchange, tickers] = await Promise.all([
      exchangeResponse.json() as Promise<{ symbols?: BinanceSymbol[] }>,
      tickerResponse.json() as Promise<BinanceTicker[]>,
    ]);
    const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
    const markets = (exchange.symbols ?? [])
      .filter((market) => market.status === "TRADING" && market.isSpotTradingAllowed !== false)
      .map((market) => {
        const ticker = tickerBySymbol.get(market.symbol);
        return {
          symbol: market.symbol,
          baseAsset: market.baseAsset,
          quoteAsset: market.quoteAsset,
          status: market.status,
          lastPrice: ticker?.lastPrice ?? "0",
          openPrice: ticker?.openPrice ?? "0",
          highPrice: ticker?.highPrice ?? "0",
          lowPrice: ticker?.lowPrice ?? "0",
          volume: ticker?.volume ?? "0",
          quoteVolume: ticker?.quoteVolume ?? "0",
          closeTime: ticker?.closeTime ?? Date.now(),
        };
      });

    return Response.json(
      { exchange: "Binance.US Spot", asOf: Date.now(), markets },
      { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=30" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown exchange error";
    return Response.json(
      { error: "Binance.US market data is temporarily unavailable.", detail: message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
