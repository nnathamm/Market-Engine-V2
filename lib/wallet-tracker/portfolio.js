import { randomUUID } from "node:crypto";
import { addressType, normalizeAddress, normalizeNetworks } from "./address.js";
import { classifyHolding, holdingKey } from "./classification.js";

function mergeHoldings(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const incoming of list || []) {
      const key = holdingKey(incoming);
      const previous = merged.get(key) || {};
      merged.set(key, {
        ...previous,
        ...incoming,
        name: incoming.name || previous.name || null,
        symbol: incoming.symbol || previous.symbol || null,
        logo: incoming.logo || previous.logo || null,
        priceUsd: incoming.priceUsd ?? previous.priceUsd ?? null,
        valueUsd: incoming.valueUsd ?? previous.valueUsd ?? null,
      });
    }
  }
  return [...merged.values()].filter((holding) => Number(holding.balance || 0) > 0);
}

function changes(previous, current, now) {
  const before = new Map((previous || []).map((holding) => [holdingKey(holding), holding]));
  const after = new Map(current.map((holding) => [holdingKey(holding), holding]));
  const events = [];
  for (const [key, holding] of after) {
    const old = before.get(key);
    const prior = Number(old?.balance || 0);
    const next = Number(holding.balance || 0);
    if (!old) {
      events.push({ id: randomUUID(), timestamp: now, type: "TOKEN_ADDED", key, previousBalance: 0, balance: next });
    } else if (next !== prior) {
      events.push({
        id: randomUUID(),
        timestamp: now,
        type: next > prior ? "BALANCE_INCREASED" : "BALANCE_DECREASED",
        key,
        previousBalance: prior,
        balance: next,
        change: next - prior,
        changePercent: prior ? ((next / prior) - 1) * 100 : null,
      });
    }
  }
  for (const [key, holding] of before) {
    if (!after.has(key)) {
      events.push({
        id: randomUUID(),
        timestamp: now,
        type: "TOKEN_REMOVED",
        key,
        previousBalance: Number(holding.balance || 0),
        balance: 0,
      });
    }
  }
  return events;
}

function summarize(holdings) {
  const visible = holdings.filter((item) => !item.hiddenByDefault);
  const priced = visible.filter((item) => Number.isFinite(item.valueUsd));
  return {
    totalTokens: holdings.length,
    visibleTokens: visible.length,
    hiddenTokens: holdings.length - visible.length,
    pricedTokens: priced.length,
    totalValueUsd: priced.reduce((total, item) => total + item.valueUsd, 0),
    valueCoverageComplete: priced.length === visible.length,
    networks: [...new Set(holdings.map((item) => item.network))],
  };
}

export class WalletPortfolioService {
  constructor({ store, alchemy, helius, rpc, config, clock = () => new Date().toISOString() }) {
    this.store = store;
    this.alchemy = alchemy;
    this.helius = helius;
    this.rpc = rpc;
    this.config = config;
    this.clock = clock;
    this.refreshing = new Set();
  }

  async add({ address, label, networks }) {
    const normalized = normalizeAddress(address);
    const selectedNetworks = normalizeNetworks(normalized, networks);
    const existing = (await this.store.list()).find(
      (wallet) => wallet.address === normalized && JSON.stringify(wallet.networks) === JSON.stringify(selectedNetworks),
    );
    if (existing) throw new Error("This wallet and network selection is already tracked");
    const now = this.clock();
    const wallet = {
      id: randomUUID(),
      address: normalized,
      addressType: addressType(normalized),
      label: String(label || "Unlabeled wallet").trim() || "Unlabeled wallet",
      labelProvenance: {
        type: "USER_ASSIGNED",
        verifiedIdentity: false,
        meaning: "This label organizes the wallet and is not proof of its owner.",
      },
      networks: selectedNetworks,
      createdAt: now,
      updatedAt: now,
      lastRefreshAt: null,
      status: "PENDING_IMPORT",
      summary: { totalTokens: 0, totalValueUsd: 0 },
      holdings: [],
      snapshots: [],
      events: [],
      safety: { readOnly: true, privateKeysUsed: false, transactionsSent: false },
    };
    await this.store.upsert(wallet);
    return this.refresh(wallet.id);
  }

  async refresh(id) {
    if (this.refreshing.has(id)) throw new Error("Wallet refresh is already in progress");
    const wallet = await this.store.get(id);
    if (!wallet) throw new Error("Wallet not found");
    this.refreshing.add(id);
    try {
      wallet.status = "IMPORTING";
      wallet.updatedAt = this.clock();
      await this.store.upsert(wallet);
      let discovered = [];
      const warnings = [];
      try {
        const alchemyResult = await this.alchemy.tokensByWallet(wallet.address, wallet.networks);
        if (Array.isArray(alchemyResult)) discovered = alchemyResult;
        else {
          discovered = alchemyResult.tokens || [];
          warnings.push(...(alchemyResult.warnings || []));
        }
      } catch (error) {
        warnings.push(error.message);
      }

      if (wallet.addressType === "solana" && wallet.networks.includes("sol-mainnet")) {
        try {
          discovered = mergeHoldings(discovered, await this.helius.assetsByOwner(wallet.address));
        } catch (error) {
          warnings.push(error.message);
        }
        try {
          discovered = mergeHoldings(discovered, await this.rpc.solanaBalances(wallet.address));
        } catch (error) {
          warnings.push(error.message);
        }
      } else {
        const candidates = [...discovered]
          .filter((holding) => this.config.rpcUrls[holding.network])
          .sort((a, b) => Number(b.valueUsd || 0) - Number(a.valueUsd || 0))
          .slice(0, this.config.directVerifyLimit);
        for (const holding of candidates) {
          try {
            await this.rpc.verifyEvm(wallet.address, holding);
          } catch (error) {
            warnings.push(`${holding.network}:${holding.symbol || holding.contractAddress}: ${error.message}`);
          }
        }
      }

      if (!discovered.length && warnings.length) {
        throw new Error(warnings.join(" | "));
      }
      const now = this.clock();
      const holdings = mergeHoldings(discovered)
        .map((holding) => classifyHolding(holding, this.config.verifiedTokenRegistry))
        .sort((a, b) => Number(b.valueUsd || 0) - Number(a.valueUsd || 0));
      const newEvents = changes(wallet.holdings, holdings, now);
      const summary = summarize(holdings);
      wallet.holdings = holdings;
      wallet.summary = summary;
      wallet.events = [...newEvents, ...(wallet.events || [])].slice(0, 500);
      wallet.snapshots = [
        { timestamp: now, summary, balances: Object.fromEntries(holdings.map((item) => [holdingKey(item), item.balance])) },
        ...(wallet.snapshots || []),
      ].slice(0, 200);
      wallet.lastRefreshAt = now;
      wallet.updatedAt = now;
      wallet.status = warnings.length ? "LIVE_WITH_WARNINGS" : "LIVE";
      wallet.warnings = warnings.slice(0, 50);
      wallet.dataProvenance = {
        discovery: ["ALCHEMY_PORTFOLIO_API", ...(this.config.heliusApiKey ? ["HELIUS_DAS"] : [])],
        verification: "DIRECT_PUBLIC_BLOCKCHAIN_RPC_FOR_MATERIAL_BALANCES",
      };
      await this.store.upsert(wallet);
      return wallet;
    } catch (error) {
      wallet.status = wallet.holdings?.length ? "STALE" : "ERROR";
      wallet.updatedAt = this.clock();
      wallet.lastError = error.message;
      await this.store.upsert(wallet);
      return wallet;
    } finally {
      this.refreshing.delete(id);
    }
  }

  async update(id, { label, networks }) {
    const wallet = await this.store.get(id);
    if (!wallet) throw new Error("Wallet not found");
    if (label !== undefined) wallet.label = String(label).trim() || "Unlabeled wallet";
    if (networks !== undefined) wallet.networks = normalizeNetworks(wallet.address, networks);
    wallet.updatedAt = this.clock();
    await this.store.upsert(wallet);
    return wallet;
  }

  async refreshAll() {
    const wallets = await this.store.list();
    return Promise.all(wallets.map((wallet) => this.refresh(wallet.id)));
  }
}
