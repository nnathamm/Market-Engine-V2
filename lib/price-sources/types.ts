export type PriceSource = "coingecko" | "binance" | "dexscreener" | "geckoterminal";

export interface SearchResult {
  /** Source-specific identifier (coingecko_id, binance pair, dex pair address, gt pool) */
  id: string;
  symbol: string;
  name: string;
  priceUsd: string;
  changePercent24Hr: string;
  rank: string;
  image?: string;
  source: PriceSource;
  contractAddress?: string;
  chain?: string;
  binancePair?: string;
  pairAddress?: string;
}

export interface LivePrice {
  priceUsd: number;
  changePercent24Hr: number;
  rank?: number;
  image?: string;
  name?: string;
  source: PriceSource;
}

export interface TokenInput {
  symbol: string;
  price_source?: string | null;
  coingecko_id?: string | null;
  binance_pair?: string | null;
  contract_address?: string | null;
  chain?: string | null;
  pair_address?: string | null;
}
