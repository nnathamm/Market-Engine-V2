const BINANCE_MARKET_DATA = "https://api.binance.us";
const SYMBOL_PATTERN = /^[A-Z0-9]{4,24}$/;
const ALLOWED_INTERVALS = new Set(["1s", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]);

type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();
  const interval = searchParams.get("interval") ?? "15m";

  if (!SYMBOL_PATTERN.test(symbol) || !ALLOWED_INTERVALS.has(interval)) {
    return Response.json({ error: "Invalid symbol or chart timeframe." }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({ symbol, interval, limit: "120" });
    const response = await fetch(`${BINANCE_MARKET_DATA}/api/v3/klines?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Binance returned ${response.status}`);

    const rows = await response.json() as BinanceKline[];
    const candles = rows.map((row) => ({
      time: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: row[6],
    }));

    return Response.json(
      { exchange: "Binance.US Spot", symbol, interval, asOf: Date.now(), candles },
      { headers: { "Cache-Control": "public, max-age=5, s-maxage=10, stale-while-revalidate=10" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown exchange error";
    return Response.json(
      { error: "This chart is temporarily unavailable.", detail: message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
