const EVM_CHAINS = new Set([
  "ethereum",
  "eth",
  "base",
  "arbitrum",
  "arbitrum-one",
  "optimism",
  "optimistic-ethereum",
  "polygon",
  "polygon-pos",
  "matic",
  "bsc",
  "bnb",
  "binance-smart-chain",
  "avalanche",
  "avax",
  "fantom",
  "ftm",
  "cronos",
  "cro",
  "gnosis",
  "xdai",
  "zksync",
  "linea",
  "mantle",
  "scroll",
  "blast",
]);

export function normalizeChain(value: unknown): string | null {
  const chain = String(value ?? "").trim().toLowerCase();
  return chain || null;
}

export function isCaseInsensitiveContractChain(chain: string | null): boolean {
  return chain !== null && EVM_CHAINS.has(chain);
}

export function normalizeContractAddress(value: unknown, chain: string | null): string | null {
  const address = String(value ?? "").trim();
  if (!address) return null;
  return isCaseInsensitiveContractChain(chain) ? address.toLowerCase() : address;
}

export function walletNetworkToChain(network: string): string {
  const map: Record<string, string> = {
    "eth-mainnet": "Ethereum",
    "sol-mainnet": "Solana",
    "base-mainnet": "Base",
    "arb-mainnet": "Arbitrum",
    "matic-mainnet": "Polygon",
    "opt-mainnet": "Optimism",
    "bsc-mainnet": "BSC",
    "avax-mainnet": "Avalanche",
  };
  return map[network] ?? network;
}

export function buildTokenIdentityKey(input: {
  symbol?: string | null;
  chain?: string | null;
  contractAddress?: string | null;
}): string {
  const chain = normalizeChain(input.chain);
  const contract = normalizeContractAddress(input.contractAddress, chain);
  return chain && contract
    ? `contract:${chain}:${contract}`
    : `symbol:${String(input.symbol ?? "").trim().toUpperCase()}`;
}