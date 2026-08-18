import { createWalletTracker } from "./index.js";
import { PgWalletStore } from "./pg-store";

// Singleton across Next.js hot reloads in dev
const g = globalThis as typeof globalThis & {
  __walletTrackerInstance?: ReturnType<typeof createWalletTracker>;
};

function buildInstance() {
  const store = new PgWalletStore();
  return createWalletTracker({ store });
}

if (!g.__walletTrackerInstance) {
  g.__walletTrackerInstance = buildInstance();
}

export const tracker = g.__walletTrackerInstance;
export const { service: portfolioService, config: trackerConfig } = tracker;
export const alchemyConfigured = Boolean(process.env.ALCHEMY_API_KEY);
