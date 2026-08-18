const WEEX_MARKET_API = "https://api-contract.weex.com";
const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = String(params.get("symbol") ?? "").toUpperCase();
  const interval = String(params.get("interval") ?? "");
  const endTime = Number(params.get("endTime"));
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol)) return errorResponse("Invalid WEEX symbol.", 400);
  if (!(interval in INTERVAL_MS)) return errorResponse("Unsupported WEEX candle interval.", 400);

  const requestedLimit = Math.max(1, Math.floor(Number(params.get("limit")) || 100));
  const historical = Number.isFinite(endTime) && endTime > 0;
  const limit = Math.min(historical ? 100 : 1000, requestedLimit);
  const upstreamParams = new URLSearchParams({ symbol, interval, limit: String(limit) });
  let path = "/capi/v3/market/klines";
  if (historical) {
    path = "/capi/v3/market/historyKlines";
    upstreamParams.set("endTime", String(Math.floor(endTime)));
    upstreamParams.set("startTime", String(Math.max(0, Math.floor(endTime) - INTERVAL_MS[interval] * (limit - 1))));
    upstreamParams.set("priceType", "LAST");
  }

  try {
    const response = await fetch(`${WEEX_MARKET_API}${path}?${upstreamParams}`, { cache: "no-store" });
    if (!response.ok) return errorResponse("WEEX candle history is temporarily unavailable.", 502);
    const rows = await response.json();
    if (!Array.isArray(rows)) return errorResponse("WEEX returned an invalid candle response.", 502);
    return Response.json(rows, { headers: { "Cache-Control": "public, max-age=2" } });
  } catch {
    return errorResponse("Unable to reach the WEEX candle feed.", 502);
  }
}
