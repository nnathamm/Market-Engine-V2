const NETWORKS = {
  "eth-mainnet": {
    kind: "evm",
    chainId: 1,
    nativeSymbol: "ETH",
    rpcEnv: "ETH_RPC_URL",
    alchemyRpc: "https://eth-mainnet.g.alchemy.com/v2/{key}",
  },
  "bnb-mainnet": {
    kind: "evm",
    chainId: 56,
    nativeSymbol: "BNB",
    rpcEnv: "BSC_RPC_URL",
    alchemyRpc: "https://bnb-mainnet.g.alchemy.com/v2/{key}",
  },
  "base-mainnet": {
    kind: "evm",
    chainId: 8453,
    nativeSymbol: "ETH",
    rpcEnv: "BASE_RPC_URL",
    alchemyRpc: "https://base-mainnet.g.alchemy.com/v2/{key}",
  },
  "arb-mainnet": {
    kind: "evm",
    chainId: 42161,
    nativeSymbol: "ETH",
    rpcEnv: "ARBITRUM_RPC_URL",
    alchemyRpc: "https://arb-mainnet.g.alchemy.com/v2/{key}",
  },
  "matic-mainnet": {
    kind: "evm",
    chainId: 137,
    nativeSymbol: "POL",
    rpcEnv: "POLYGON_RPC_URL",
    alchemyRpc: "https://polygon-mainnet.g.alchemy.com/v2/{key}",
  },
  "opt-mainnet": {
    kind: "evm",
    chainId: 10,
    nativeSymbol: "ETH",
    rpcEnv: "OPTIMISM_RPC_URL",
    alchemyRpc: "https://opt-mainnet.g.alchemy.com/v2/{key}",
  },
  "sol-mainnet": {
    kind: "solana",
    nativeSymbol: "SOL",
    rpcEnv: "SOLANA_RPC_URL",
  },
};

export const SUPPORTED_NETWORKS = Object.freeze(NETWORKS);
export const EVM_NETWORKS = Object.freeze(
  Object.keys(NETWORKS).filter((name) => NETWORKS[name].kind === "evm"),
);
export const SOLANA_NETWORKS = Object.freeze(["sol-mainnet"]);

export function loadConfig(env = process.env) {
  let verifiedTokenRegistry = {};
  try {
    verifiedTokenRegistry = JSON.parse(env.VERIFIED_TOKEN_REGISTRY_JSON || "{}");
  } catch {
    throw new Error("VERIFIED_TOKEN_REGISTRY_JSON must be valid JSON");
  }
  return {
    host: env.HOST || "0.0.0.0",
    port: Number(env.PORT || 3000),
    dataFile: env.DATA_FILE || "./data/wallets.json",
    trackerApiKey: env.TRACKER_API_KEY || "",
    alchemyApiKey: env.ALCHEMY_API_KEY || "",
    heliusApiKey: env.HELIUS_API_KEY || "",
    directVerifyLimit: Math.max(0, Number(env.DIRECT_VERIFY_LIMIT || 25)),
    refreshIntervalSeconds: Math.max(0, Number(env.REFRESH_INTERVAL_SECONDS || 300)),
    verifiedTokenRegistry,
    rpcUrls: Object.fromEntries(
      Object.entries(NETWORKS).map(([network, definition]) => {
        const explicit = env[definition.rpcEnv] || "";
        const generated =
          definition.alchemyRpc && env.ALCHEMY_API_KEY
            ? definition.alchemyRpc.replace("{key}", env.ALCHEMY_API_KEY)
            : "";
        const solanaGenerated =
          network === "sol-mainnet" && env.HELIUS_API_KEY
            ? `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`
            : "";
        return [network, explicit || generated || solanaGenerated];
      }),
    ),
  };
}
