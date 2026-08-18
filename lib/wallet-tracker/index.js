import { loadConfig, SUPPORTED_NETWORKS } from "./config.js";
import { AlchemyPortfolioProvider } from "./providers/alchemy.js";
import { HeliusProvider } from "./providers/helius.js";
import { RpcVerifier } from "./providers/rpc.js";
import { WalletPortfolioService } from "./portfolio.js";

export function createWalletTracker(options = {}) {
  const config = options.config || loadConfig(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const store = options.store;
  if (!store) throw new Error("createWalletTracker requires a store option");
  const alchemy = options.alchemy || new AlchemyPortfolioProvider({ apiKey: config.alchemyApiKey, fetchImpl });
  const helius = options.helius || new HeliusProvider({ apiKey: config.heliusApiKey, fetchImpl });
  const rpc = options.rpc || new RpcVerifier({ rpcUrls: config.rpcUrls, fetchImpl });
  const service = new WalletPortfolioService({ store, alchemy, helius, rpc, config, clock: options.clock });
  return { config, store, alchemy, helius, rpc, service };
}

export { SUPPORTED_NETWORKS, WalletPortfolioService };
