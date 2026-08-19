export const MARKET_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export type MarketInterval = (typeof MARKET_INTERVALS)[number];

export type MarketNavigationRequest = {
  tokenId?: number;
  tokenName: string;
  tokenSymbol: string;
  exchangeVerified?: boolean;
  preferredExchange?: string;
  exchangeSymbol?: string;
  chain?: string;
  contractAddress?: string;
  coingeckoId?: string;
  source: "monitor" | "browse";
  interval?: MarketInterval;
};

export function isMarketInterval(value: unknown): value is MarketInterval {
  return typeof value === "string" && MARKET_INTERVALS.includes(value as MarketInterval);
}

export function normalizeExchangeSymbol(value: unknown) {
  const symbol = String(value ?? "").trim().toUpperCase().replace(/^CMT_/, "");
  return /^[A-Z0-9]{2,24}USDT$/.test(symbol) ? symbol : "";
}

export function readMarketRequest(params: URLSearchParams): MarketNavigationRequest | null {
  const exchangeSymbol = normalizeExchangeSymbol(params.get("symbol"));
  const tokenSymbol = String(params.get("tokenSymbol") ?? "").trim().toUpperCase();
  const tokenName = String(params.get("tokenName") ?? tokenSymbol).trim();
  const source = params.get("source") === "monitor" ? "monitor" : "browse";
  if (!exchangeSymbol && !tokenSymbol) return null;

  const numericId = Number(params.get("tokenId"));
  const intervalValue = params.get("interval");
  return {
    tokenId: Number.isInteger(numericId) && numericId > 0 ? numericId : undefined,
    tokenName: tokenName || tokenSymbol || exchangeSymbol.replace(/USDT$/, ""),
    tokenSymbol: tokenSymbol || exchangeSymbol.replace(/USDT$/, ""),
    exchangeVerified: params.get("verified") === "1",
    preferredExchange: params.get("exchange") || undefined,
    exchangeSymbol: exchangeSymbol || undefined,
    chain: params.get("chain") || undefined,
    contractAddress: params.get("contract") || undefined,
    coingeckoId: params.get("token") || undefined,
    source,
    interval: isMarketInterval(intervalValue) ? intervalValue : undefined,
  };
}

export function writeMarketRequest(params: URLSearchParams, request: MarketNavigationRequest | null) {
  for (const key of ["symbol", "token", "tokenId", "tokenName", "tokenSymbol", "verified", "exchange", "chain", "contract", "source", "interval"]) {
    params.delete(key);
  }
  if (!request) return;

  const values: Array<[string, string | number | undefined]> = [
    ["symbol", normalizeExchangeSymbol(request.exchangeSymbol) || undefined],
    ["token", request.coingeckoId],
    ["tokenId", request.tokenId],
    ["tokenName", request.tokenName],
    ["tokenSymbol", request.tokenSymbol.toUpperCase()],
    ["verified", request.exchangeVerified ? "1" : undefined],
    ["exchange", request.preferredExchange],
    ["chain", request.chain],
    ["contract", request.contractAddress],
    ["source", request.source],
    ["interval", request.interval],
  ];
  for (const [key, value] of values) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
}