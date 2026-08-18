type WeexSymbol = {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  pricePrecision?: number;
};

type WeexTicker = {
  symbol?: string;
  last?: string;
  high_24h?: string;
  low_24h?: string;
  volume_24h?: string;
  base_volume?: string;
  timestamp?: string;
  priceChangePercent?: string;
  markPrice?: string;
  indexPrice?: string;
};

const WEEX_MARKET_API = "https://api-contract.weex.com";

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentSymbol(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/^CMT_/, "");
}

export async function GET() {
  try {
    const [contractsResponse, tickersResponse] = await Promise.all([
      fetch(`${WEEX_MARKET_API}/capi/v3/market/exchangeInfo`, { cache: "no-store" }),
      fetch(`${WEEX_MARKET_API}/capi/v2/market/tickers`, { cache: "no-store" }),
    ]);
    if (!contractsResponse.ok || !tickersResponse.ok) {
      return Response.json({ error: "WEEX market data is temporarily unavailable." }, { status: 502 });
    }

    const contractsPayload = await contractsResponse.json() as { symbols?: WeexSymbol[] };
    const tickersPayload = await tickersResponse.json() as WeexTicker[];
    const tickerBySymbol = new Map(
      (Array.isArray(tickersPayload) ? tickersPayload : []).map((ticker) => [currentSymbol(ticker.symbol), ticker]),
    );
    const markets = (contractsPayload.symbols ?? []).flatMap((contract) => {
      const symbol = currentSymbol(contract.symbol);
      const ticker = tickerBySymbol.get(symbol);
      if (!symbol || !contract.baseAsset || !contract.quoteAsset || !ticker) return [];
      const lastPrice = finiteNumber(ticker.last);
      const changeRatio = finiteNumber(ticker.priceChangePercent);
      const openPrice = lastPrice > 0 && changeRatio > -1 ? lastPrice / (1 + changeRatio) : lastPrice;
      return [{
        symbol,
        baseAsset: contract.baseAsset,
        quoteAsset: contract.quoteAsset,
        status: "TRADING",
        lastPrice: String(ticker.last ?? "0"),
        openPrice: String(openPrice),
        highPrice: String(ticker.high_24h ?? "0"),
        lowPrice: String(ticker.low_24h ?? "0"),
        volume: String(ticker.base_volume ?? "0"),
        quoteVolume: String(ticker.volume_24h ?? "0"),
        closeTime: finiteNumber(ticker.timestamp) || Date.now(),
        changePercent: changeRatio * 100,
        markPrice: String(ticker.markPrice ?? "0"),
        indexPrice: String(ticker.indexPrice ?? "0"),
        pricePrecision: Number.isInteger(contract.pricePrecision) ? contract.pricePrecision : null,
      }];
    });

    return Response.json(
      { exchange: "WEEX", marketType: "USDT perpetuals", markets },
      { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" } },
    );
  } catch {
    return Response.json({ error: "Unable to reach the WEEX public market feed." }, { status: 502 });
  }
}
