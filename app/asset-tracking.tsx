"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarketNavigationRequest } from "@/lib/market-navigation";
import { buildTokenIdentityKey, walletNetworkToChain } from "@/lib/token-identity";

const TRACKED_STORAGE_KEY = "signal-control:tracked-tokens";
const TRACKED_CHANGED_EVENT = "signal-control:tracked-tokens-changed";

function trackedTokenIdentity(token: Pick<DbToken, "symbol" | "chain" | "contract_address">): string {
  return buildTokenIdentityKey({
    symbol: token.symbol,
    chain: token.chain,
    contractAddress: token.contract_address,
  });
}

function walletHoldingIdentity(holding: PortfolioWallet["holdings"][number]): string {
  return buildTokenIdentityKey({
    symbol: holding.symbol,
    chain: walletNetworkToChain(holding.network),
    contractAddress: holding.contractAddress,
  });
}

async function pollWalletReady(id: string, maxAttempts = 20): Promise<PortfolioWallet | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(`/api/wallet-portfolio/${id}`);
    if (!r.ok) return null;
    const w: PortfolioWallet = await r.json();
    if (w.status !== "PENDING_IMPORT" && w.status !== "IMPORTING") return w;
    await new Promise(res => setTimeout(res, 1500));
  }
  return null;
}

type PriceSource = "coingecko" | "binance" | "dexscreener" | "geckoterminal";
type CoinResult = {
  id: string; symbol: string; name: string; priceUsd: string; changePercent24Hr: string; rank: string; image?: string;
  source: PriceSource; contractAddress?: string; chain?: string; binancePair?: string; pairAddress?: string;
};
type LivePrice = { priceUsd: number; changePercent24Hr: number; rank?: number; image?: string; name?: string; source: PriceSource };
type DbToken = {
  id: number; symbol: string; label: string | null; created_at: string;
  coingecko_id: string | null; image_url: string | null; full_name: string | null;
  cached_price: number | null; cached_change_24h: number | null; cached_rank: number | null;
  price_source: string | null; contract_address: string | null; chain: string | null;
  binance_pair: string | null; pair_address: string | null; wallet_source: string | null;
  preferred_exchange: string | null; exchange_symbol: string | null;
  exchange_symbol_verified_at: string | null;
};
type PortfolioWallet = {
  id: string; address: string; addressType: "evm" | "solana"; label: string;
  networks: string[]; createdAt: string; updatedAt: string; lastRefreshAt: string | null;
  status: "PENDING_IMPORT" | "IMPORTING" | "LIVE" | "LIVE_WITH_WARNINGS" | "STALE" | "ERROR";
  summary: { totalTokens: number; visibleTokens: number; totalValueUsd: number; valueCoverageComplete: boolean };
  holdings: Array<{ network: string; contractAddress: string | null; symbol: string | null; name: string | null; balance: number; priceUsd: number | null; valueUsd: number | null; logo: string | null; trust: string; hiddenByDefault: boolean }>;
  warnings?: string[]; lastError?: string;
};

type TrackingTab = "tokens" | "wallets";
type DialogKind = TrackingTab | null;

type TokenRow = {
  symbol: string;
  name: string;
  pair: string;
  networks: number;
  price: string;
  change: number;
  activity: string;
  tone: string;
  image?: string;
  coingecko_id?: string;
  db_id?: number;
  rank?: number;
  price_source?: string | null;
  contract_address?: string | null;
  chain?: string | null;
  preferred_exchange?: string | null;
  exchange_symbol?: string | null;
  exchange_symbol_verified?: boolean;
};

type WalletRow = {
  short: string;
  name: string;
  address: string;
  chain: string;
  holdings: string;
  change: number;
  activity: string;
  tone: string;
  portfolio_id?: string;
  status?: string;
  addressType?: "evm" | "solana";
};


function AssetBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`tracking-asset-badge ${tone}`} aria-hidden="true">{label}</span>;
}

function Change({ value }: { value: number }) {
  const v = isFinite(Number(value)) ? Number(value) : 0;
  return <span className={v >= 0 ? "tracking-positive" : "tracking-negative"}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
}

function tokenContractUrl(token: TokenRow) {
  if (!token.contract_address) return null;
  const chain = String(token.chain ?? "").toLowerCase();
  if (chain.includes("sol")) return `https://solscan.io/token/${token.contract_address}`;
  if (chain.includes("base")) return `https://basescan.org/token/${token.contract_address}`;
  if (chain.includes("arbitrum")) return `https://arbiscan.io/token/${token.contract_address}`;
  if (chain.includes("polygon")) return `https://polygonscan.com/token/${token.contract_address}`;
  if (chain.includes("optimism")) return `https://optimistic.etherscan.io/token/${token.contract_address}`;
  if (chain.includes("bsc") || chain.includes("bnb")) return `https://bscscan.com/token/${token.contract_address}`;
  if (chain.includes("avalanche")) return `https://snowtrace.io/token/${token.contract_address}`;
  return `https://etherscan.io/token/${token.contract_address}`;
}

function CoinIcon({ symbol, imageUrl }: { symbol: string; imageUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl || `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
  if (failed) return <span className="tracking-coin-letter">{symbol.slice(0, 1)}</span>;
  return <img src={src} alt={symbol} width={28} height={28} className="tracking-coin-img" onError={() => setFailed(true)} />;
}

function TrackingDialog({ kind, close, finish, onSave, initialSearch, mode = "add" }: {
  kind: Exclude<DialogKind, null>;
  close: () => void;
  finish: (message: string) => void;
  onSave?: (data: Record<string, string | number | null>) => Promise<void>;
  initialSearch?: string;
  mode?: "add" | "link";
}) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [results, setResults] = useState<CoinResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<CoinResult | null>(null);
  const [label, setLabel] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChain, setWalletChain] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [noPriceWarning, setNoPriceWarning] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [close]);

  useEffect(() => {
    if (kind !== "tokens") return;
    const q = search.trim();
    if (!q) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/coins/search?q=${encodeURIComponent(q)}`);
        setResults(res.ok ? await res.json() : []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 380);
    return () => clearTimeout(timer);
  }, [search, kind]);

  function pickCoin(coin: CoinResult) {
    setSelectedCoin(coin);
    setSearch(coin.symbol);
    setResults([]);
    setNoPriceWarning(false);
    if (!label) setLabel(coin.name);
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    // First attempt with no coin selected: show warning and stop. Second attempt proceeds.
    if (kind === "tokens" && mode !== "link" && !selectedCoin && search.trim() && !noPriceWarning) {
      setNoPriceWarning(true);
      return;
    }
    setSaving(true);
    try {
      if (kind === "tokens") {
        const symbol = (selectedCoin?.symbol ?? search.trim()).toUpperCase();
        if (symbol && onSave) await onSave({
          symbol, label,
          ...(selectedCoin ? {
            coingecko_id: selectedCoin.source === "coingecko" ? selectedCoin.id : null,
            image_url: selectedCoin.image ?? null,
            full_name: selectedCoin.name,
            cached_price: parseFloat(selectedCoin.priceUsd),
            cached_change_24h: parseFloat(selectedCoin.changePercent24Hr),
            cached_rank: parseInt(selectedCoin.rank, 10),
            price_source: selectedCoin.source,
            contract_address: selectedCoin.contractAddress ?? null,
            chain: selectedCoin.chain ?? null,
            binance_pair: selectedCoin.binancePair ?? null,
            pair_address: selectedCoin.pairAddress ?? null,
            ...(mode === "link" ? {
              preferred_exchange: null,
              exchange_symbol: null,
            } : {}),
          } : {}),
        });
        finish(symbol
          ? (mode === "link" ? `${symbol} price source updated.` : `${symbol} added to your tracked tokens.`)
          : "Token added to your watchlist.");
      } else {
        const address = walletAddress.trim();
        if (address && onSave) await onSave({ address, label, chain: walletChain, notes });
        finish(address ? `Wallet ${address.slice(0, 8)}… added to your watchlist.` : "Wallet added to your watchlist.");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const changePercent = selectedCoin ? parseFloat(selectedCoin.changePercent24Hr) : 0;
  const price = selectedCoin ? parseFloat(selectedCoin.priceUsd) : 0;
  const priceStr = price >= 1 ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${price.toPrecision(4)}`;

  return (
    <div className="tracking-modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && close()}>
      <form id="Addnewtoken" className="tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-dialog-title" onSubmit={submit}>
        <header>
          <div><span className="tracking-dialog-mark" aria-hidden="true">◎</span><h2 id="tracking-dialog-title">{mode === "link" ? "Link Market Data" : `Add New ${kind === "tokens" ? "Token" : "Wallet"}`}</h2></div>
          <button type="button" aria-label="Close dialog" onClick={close}>×</button>
        </header>
        <p>{mode === "link" ? "Search for this token to link a live price source (CoinGecko, Binance, DEX Screener, or GeckoTerminal)." : kind === "tokens" ? "Add a token or trading pair to your monitored assets." : "Add a wallet address to your monitored assets."}</p>

        {kind === "tokens" ? (
          <>
            <label className="tracking-dialog-field">
              <span>Search Token or Paste Contract</span>
              <div className="tracking-input-with-icon">
                <input
                  type="search"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedCoin(null); setNoPriceWarning(false); }}
                  placeholder="Search by token name, symbol, or contract address..."
                  autoComplete="off"
                />
                <i aria-hidden="true">{search.trim() && searching ? "…" : "⌕"}</i>
              </div>
              {search.trim() && results.length > 0 && (
                <ul className="tracking-coin-results" role="listbox">
                  {results.map(coin => {
                    const p = parseFloat(coin.priceUsd);
                    const c = parseFloat(coin.changePercent24Hr);
                    const sourceLabel = coin.source === "binance" ? "Binance" : coin.source === "dexscreener" ? "DEX" : coin.source === "geckoterminal" ? "GeckoTerminal" : "CoinGecko";
                    return (
                      <li key={coin.id} role="option" aria-selected={false}>
                        <button type="button" onClick={() => pickCoin(coin)}>
                          <CoinIcon symbol={coin.symbol} imageUrl={coin.image} />
                          <span className="tracking-coin-info">
                            <strong>{coin.symbol} <span className="tracking-source-badge">{sourceLabel}</span></strong>
                            <small>{coin.name}{coin.chain ? ` · ${coin.chain}` : ""}</small>
                          </span>
                          <span className="tracking-coin-meta">
                            <b>${p >= 1 ? p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p > 0 ? p.toPrecision(4) : "—"}</b>
                            <em className={c >= 0 ? "tracking-positive" : "tracking-negative"}>
                              {c >= 0 ? "+" : ""}{c.toFixed(2)}%
                            </em>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <small>Supports a token name, symbol, or contract address.</small>
            </label>
            {selectedCoin && (
              <div className="tracking-token-result">
                <CoinIcon symbol={selectedCoin.symbol} imageUrl={selectedCoin.image} />
                <span>
                  <strong>{selectedCoin.name} <b className="tracking-positive">✓</b></strong>
                  <small>{selectedCoin.symbol} · {selectedCoin.source === "coingecko" && selectedCoin.rank !== "0" ? `Rank #${selectedCoin.rank}` : selectedCoin.source === "binance" ? `Binance · ${selectedCoin.binancePair}` : selectedCoin.source === "dexscreener" ? `DEX · ${selectedCoin.chain}` : `GeckoTerminal · ${selectedCoin.chain}`}</small>
                </span>
                <span className="tracking-coin-meta">
                  <b>{priceStr}</b>
                  <em className={changePercent >= 0 ? "tracking-positive" : "tracking-negative"}>
                    {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                  </em>
                </span>
              </div>
            )}
            <label className="tracking-dialog-field"><span>Label (Optional)</span><input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={selectedCoin ? `e.g. ${selectedCoin.name}` : "e.g. My Token"} /><small>Give this token a name to easily identify it.</small></label>
            <label className="tracking-dialog-field"><span>Add to Watchlist (Optional)</span><select defaultValue=""><option value="">Select watchlist</option><option>Core assets</option><option>Momentum watch</option><option>Research</option></select><small>Organize this token in a watchlist.</small></label>
          </>
        ) : (
          <>
            <label className="tracking-dialog-field"><span>Wallet Address</span><div className="tracking-input-with-icon"><input required type="text" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} placeholder="Paste wallet address here" /><i aria-hidden="true">⌗</i></div><small>Supports Ethereum, BSC, Polygon, Arbitrum, Base and more.</small></label>
            <label className="tracking-dialog-field"><span>Label (Optional)</span><input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Binance: Hot Wallet" /><small>Give this wallet a name to easily identify it.</small></label>
            <label className="tracking-dialog-field"><span>Chain (Optional)</span><select value={walletChain} onChange={e => setWalletChain(e.target.value)}><option value="">Auto-detect chain</option><option>Ethereum</option><option>Solana</option><option>Base</option><option>Arbitrum</option><option>Polygon</option></select><small>If left blank, the chain will be detected when a data provider is connected.</small></label>
            <label className="tracking-dialog-field"><span>Notes (Optional)</span><textarea maxLength={200} value={notes} placeholder="Add any notes about this wallet..." onChange={(event) => setNotes(event.target.value)} /><small className="tracking-note-count">{notes.length} / 200</small></label>
          </>
        )}

        <label className="tracking-monitor-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span aria-hidden="true" /><b>Start monitoring immediately<small>Prepare this asset for alerts right away.</small></b></label>
        {kind === "tokens" && noPriceWarning && !selectedCoin && (
          <p className="tracking-no-price-warning" role="alert">
            ⚠ No CoinGecko match selected — price data won&apos;t be available. Pick a result from the list to enable live prices, or click “Add anyway” to continue without prices.
          </p>
        )}
        {saveError && <p className="tracking-save-error" role="alert">⚠ {saveError}</p>}
        <footer>
          <button className="tracking-cancel" type="button" onClick={close} disabled={saving}>Cancel</button>
          <button className="tracking-primary" type="submit" disabled={saving || (mode === "link" && !selectedCoin)}>
            {saving ? "Saving…" : mode === "link" ? "Link Token" : kind === "tokens" && noPriceWarning && !selectedCoin ? "Add anyway" : `Add ${kind === "tokens" ? "Token" : "Wallet"}`}
          </button>
        </footer>
      </form>
    </div>
  );
}

function TokenIntelligence({ token, priceLoading, onLinkMarketData, onOpenInMarkets }: {
  token: TokenRow;
  priceLoading?: boolean;
  onLinkMarketData?: () => void;
  onOpenInMarkets: () => void;
}) {
  const geckoUrl = token.coingecko_id
    ? `https://www.coingecko.com/en/coins/${token.coingecko_id}`
    : null;
  const contractUrl = tokenContractUrl(token);
  const missingPriceSource = !token.price_source;
  return (
    <aside className="tracking-intelligence">
      <div className="tracking-intelligence-sticky">
        <div id="selected-token-identity" className="tracking-selected-identity">
          {token.image
            ? <img src={token.image} alt={token.symbol} width={28} height={28} className="tracking-coin-img" />
            : <AssetBadge label={token.symbol} tone={token.tone} />}
          <div><h2 title={`${token.name} ${token.symbol}`}>{token.name} {token.symbol}</h2><small>{token.pair} · {token.networks} network{token.networks !== 1 ? "s" : ""}</small></div>
          <b className="tracking-active-pill">● Active</b>
        </div>
        <div className="tracking-hero-stats">
          <span>
            <small>Price</small>
            <strong className={priceLoading ? "" : "tracking-price-loaded"}>
              {priceLoading
                ? <span className="tracking-price-skeleton" aria-label="Loading price…" />
                : token.price}
            </strong>
            <Change value={token.change} />
          </span>
          <span><small>Last Activity</small><strong className="tracking-activity"><i /> {token.activity}</strong></span>
        </div>
        {missingPriceSource && (
          <div className="tracking-no-price-notice" role="status">
            <span>
              <strong>No price source linked</strong>
              <small>This token was added without a market data match.</small>
            </span>
            <button className="tracking-primary" type="button" onClick={onLinkMarketData}>
              Link market data
            </button>
          </div>
        )}
        <div className="tracking-detail-actions">
          <button className="tracking-open-markets" type="button" aria-label={`Open ${token.name} in Markets`} onClick={onOpenInMarkets}>Open in Markets →</button>
          {geckoUrl
            ? <a className="tracking-detail-action-link" href={geckoUrl} target="_blank" rel="noreferrer">Open on CoinGecko ↗</a>
            : <button type="button" disabled>CoinGecko unavailable</button>}
          {contractUrl
            ? <a className="tracking-detail-action-link" href={contractUrl} target="_blank" rel="noreferrer" title={token.contract_address ?? undefined}>View Contract ↗</a>
            : <button type="button" disabled>Contract unavailable</button>}
        </div>
        <div id="token-facts-grid" className="tracking-facts">
          <span><small>Networks</small><strong>{token.networks}</strong></span>
          <span><small>Pair</small><strong>{token.pair}</strong></span>
          {token.rank != null && <span><small>Rank</small><strong>#{token.rank}</strong></span>}
        </div>
      </div>
      <div className="tracking-intelligence-scroll">
        <section className="tracking-side-card">
          <p>This interface is ready to show price moves, holder activity, and alerts after an asset-intelligence provider is connected.</p>
          <div className="tracking-side-list">
            <span><AssetBadge label="24H" tone="violet" /><b>Price movement<small>24h change from market data</small></b><Change value={token.change} /></span>
            <span><AssetBadge label="NET" tone="blue" /><b>Network coverage<small>{token.networks} chain{token.networks !== 1 ? "s" : ""} represented</small></b><em>Ready</em></span>
            <span><AssetBadge label="AL" tone="teal" /><b>Alert state<small>Prepared for signal notifications</small></b><em>On</em></span>
          </div>
        </section>
        <section className="tracking-side-card">
          <h3>Recent Activity (24H)</h3>
          <p className="tracking-no-data">Live transaction activity requires a connected asset-intelligence provider.</p>
        </section>
      </div>
    </aside>
  );
}

function WalletIntelligence({ wallet, portfolioWallet }: { wallet: WalletRow; portfolioWallet?: PortfolioWallet }) {
  const explorerUrl = wallet.addressType === "solana" || wallet.chain === "Solana"
    ? `https://solscan.io/account/${wallet.address}`
    : `https://etherscan.io/address/${wallet.address}`;

  const totalUsd = portfolioWallet?.summary?.totalValueUsd ?? 0;
  const topHoldings = portfolioWallet?.holdings
    ? [...portfolioWallet.holdings]
        .filter(h => (h.valueUsd ?? 0) > 0)
        .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
        .slice(0, 5)
    : [];

  const firstSeen = portfolioWallet?.createdAt
    ? new Date(portfolioWallet.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const tokensHeld = portfolioWallet?.summary?.totalTokens ?? "—";
  const chainsCount = portfolioWallet?.networks?.length ?? "—";

  const toneForSymbol = (symbol: string | null) => {
    const s = (symbol ?? "").toUpperCase();
    if (s === "ETH") return "violet";
    if (s === "BTC") return "orange";
    if (s.startsWith("USD")) return "teal";
    if (s === "BNB") return "gold";
    return "blue";
  };

  return (
    <aside className="tracking-intelligence">
      <div className="tracking-intelligence-sticky">
        <div className="tracking-selected-identity">
          <AssetBadge label={wallet.short} tone={wallet.tone} />
          <div><h2 title={wallet.name}>{wallet.name}</h2><small className="tracking-wallet-address" title={wallet.address}>{wallet.address}</small></div>
          <b className="tracking-active-pill">● {wallet.status ? wallet.status.replace(/_/g, " ") : "Active"}</b>
        </div>
        <div className="tracking-hero-stats">
          <span><small>Total Holdings (USD)</small><strong>{wallet.holdings}</strong></span>
          <span><small>Last Activity</small><strong className="tracking-activity"><i /> {wallet.activity}</strong></span>
        </div>
        <div className="tracking-detail-actions">
          <a className="tracking-primary tracking-action-link" href={explorerUrl} target="_blank" rel="noreferrer">Open in Explorer ↗</a>
          <button type="button">View Intelligence ↗</button>
        </div>
      </div>
      <div className="tracking-intelligence-scroll">
        <div className="tracking-facts">
          <span><small>Added</small><strong>{firstSeen}</strong></span>
          <span><small>Tokens Held</small><strong>{tokensHeld}</strong></span>
          <span><small>Chains</small><strong>{chainsCount}</strong></span>
          <span><small>Chain</small><strong>{wallet.chain}</strong></span>
        </div>
        <section className="tracking-side-card">
          <h3>Top Holdings</h3>
        {topHoldings.length > 0 ? (
          <div className="tracking-holdings">
            {topHoldings.map((h, i) => {
              const sym = h.symbol ?? "?";
              const pct = totalUsd > 0 && h.valueUsd != null
                ? ((h.valueUsd / totalUsd) * 100).toFixed(1)
                : null;
              const valStr = h.valueUsd != null
                ? `$${h.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "—";
              return (
                <span key={i}>
                  <AssetBadge label={sym.slice(0, 4)} tone={toneForSymbol(sym)} />
                  <b>{sym}</b>
                  <strong>{valStr}</strong>
                  {pct != null && <em>{pct}%</em>}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="tracking-no-data">
            {portfolioWallet?.status === "PENDING_IMPORT" || portfolioWallet?.status === "IMPORTING"
              ? "Holdings are being imported…"
              : "No holdings data available yet."}
          </p>
        )}
        </section>
        <section className="tracking-side-card">
          <h3>Recent Activity (24H)</h3>
          <p className="tracking-no-data">Live transaction activity requires a connected asset-intelligence provider.</p>
        </section>
      </div>
    </aside>
  );
}

type WalletDeletePending = {
  portfolioId: string;
  tokensToRemove: DbToken[];
};

function WalletDeleteDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: WalletDeletePending;
  onConfirm: (keepTokenIds: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  // Each token row defaults to unchecked (will be deleted). User checks to keep.
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const toggle = (tokenId: number) =>
    setKept(prev => {
      const next = new Set(prev);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm([...kept]);
    } finally {
      setDeleting(false);
    }
  };

  const hasTokens = pending.tokensToRemove.length > 0;

  return (
    <div
      className="tracking-modal-backdrop"
      role="presentation"
      onMouseDown={e => e.currentTarget === e.target && onCancel()}
    >
      <div className="tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-delete-title">
        <header>
          <div>
            <span className="tracking-dialog-mark" aria-hidden="true">▱</span>
            <h2 id="wallet-delete-title">Delete Wallet</h2>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onCancel}>×</button>
        </header>

        {hasTokens ? (
          <>
            <p>
              The following tokens were auto-imported from this wallet and will be removed
              from your watchlist. Check any you want to <strong>keep</strong>.
            </p>
            <ul className="tracking-wallet-delete-tokens">
              {pending.tokensToRemove.map(t => {
                const isKept = kept.has(t.id);
                return (
                  <li key={t.id}>
                    <label className="tracking-wallet-delete-token-row">
                      <input
                        type="checkbox"
                        checked={isKept}
                        onChange={() => toggle(t.id)}
                      />
                      <span className="tracking-wallet-delete-token-info">
                        {t.image_url
                          ? <img src={t.image_url} alt={t.symbol} width={20} height={20} className="tracking-coin-img" />
                          : <span className="tracking-coin-letter">{t.symbol.slice(0, 1)}</span>}
                        <strong>{t.symbol}</strong>
                        {(t.full_name || t.label) && (
                          <small>{t.full_name ?? t.label}</small>
                        )}
                        {(t.chain || t.contract_address) && (
                          <small>
                            {[t.chain, t.contract_address
                              ? `${t.contract_address.slice(0, 6)}…${t.contract_address.slice(-4)}`
                              : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </span>
                      {isKept && <span className="tracking-keep-badge">Keep</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="tracking-wallet-delete-hint">
              Kept tokens will remain in your watchlist as manually tracked assets.
            </p>
          </>
        ) : (
          <p>This wallet has no auto-imported tokens. Removing it will not affect your token watchlist.</p>
        )}

        <footer>
          <button className="tracking-cancel" type="button" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            className="tracking-menu-delete tracking-primary"
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete Wallet"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function AssetTrackingView({ onOpenInMarkets }: {
  onOpenInMarkets: (request: MarketNavigationRequest) => void;
}) {
  const [tab, setTab] = useState<TrackingTab>("tokens");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);
  const [perPageOpen, setPerPageOpen] = useState(false);
  const [dbTokens, setDbTokens] = useState<DbToken[]>([]);
  const [portfolioWallets, setPortfolioWallets] = useState<PortfolioWallet[]>([]);
  const [alchemyConfigured, setAlchemyConfigured] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenRow | null>(null);
  // Always-current snapshot of selectedToken for reading inside async callbacks
  // without adding selectedToken to their dependency arrays.
  const selectedTokenRef = useRef<TokenRow | null>(null);
  useEffect(() => { selectedTokenRef.current = selectedToken; }, [selectedToken]);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshTokens = useCallback(() =>
    fetch("/api/tracked/tokens")
      .then(r => r.ok ? r.json() : [])
      .then((tokens: DbToken[]) => {
        setDbTokens(tokens);
        const symbols = [...new Set(tokens.map((t: DbToken) => t.symbol))];
        localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(symbols));
        window.dispatchEvent(new Event(TRACKED_CHANGED_EVENT));
      })
      .catch(() => {}), []);
  const refreshWallets = useCallback(() =>
    fetch("/api/wallet-portfolio")
      .then(r => r.ok ? r.json() : { wallets: [], alchemyConfigured: false })
      .then(({ wallets, alchemyConfigured: ac }) => { setPortfolioWallets(wallets); setAlchemyConfigured(ac); })
      .catch(() => {}), []);

  useEffect(() => { refreshTokens(); refreshWallets(); }, [refreshTokens, refreshWallets]);


  const [liveData, setLiveData] = useState<Map<string, LivePrice>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);
  const [walletClock, setWalletClock] = useState<number | null>(null);
  const [livePriceFetching, setLivePriceFetching] = useState(false);
  // Set to true once any initial live-price fetch has settled; prevents the
  // skeleton from reappearing on later dbTokens changes or periodic refreshes.
  const livePriceFetchedOnce = useRef(false);
  // Incremented every time the effect fires before the first fetch settles.
  // Each fetch closes over its own generation; only the fetch whose generation
  // still matches the current value at settlement time may clear the skeleton.
  // This eliminates the race where React Strict Mode's double-invoke (or a
  // rapid dbTokens change) causes an earlier request to dismiss the skeleton
  // while the later one is still in flight.
  const initialFetchGenRef = useRef(0);

  // Always-current set of tracked symbols — read inside async callbacks to
  // prevent in-flight live-price responses from re-inserting a deleted symbol.
  const trackedSymbolsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    trackedSymbolsRef.current = new Set(dbTokens.map(t => t.symbol));
  }, [dbTokens]);

  useEffect(() => {
    const tick = () => setSecondsSinceUpdate(
      lastUpdated === null ? null : Math.floor((Date.now() - lastUpdated.getTime()) / 1000),
    );
    const initialTick = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(intervalId);
    };
  }, [lastUpdated]);

  useEffect(() => {
    const tick = () => setWalletClock(Date.now());
    const initialTick = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!dbTokens.length) return;

    // Show the skeleton for the very first live-price fetch only.
    // Increment the generation counter so that if this effect fires again
    // (Strict Mode double-invoke or rapid dbTokens change) before the current
    // fetch settles, the earlier fetch's generation will be stale and it will
    // not be allowed to clear the skeleton prematurely.
    if (!livePriceFetchedOnce.current) {
      initialFetchGenRef.current += 1;
      setLivePriceFetching(true);
    }
    // Capture the generation for this specific effect invocation. The closure
    // over `myGen` is what lets the finally-handler verify it is still current.
    const myGen = initialFetchGenRef.current;

    const fetchLivePrices = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/coins/live-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: dbTokens }),
      })
        .then(async r => {
          if (!r.ok) return; // preserve existing data and timestamp on HTTP errors
          const data: Record<string, LivePrice> = await r.json();
          // Filter to only currently-tracked symbols so an in-flight request
          // that resolves after a deletion cannot re-insert a stale entry.
          const currentSymbols = trackedSymbolsRef.current;
          const filtered = Object.fromEntries(
            Object.entries(data).filter(([sym]) => currentSymbols.has(sym))
          );
          if (Object.keys(filtered).length > 0) {
            setLiveData(new Map(Object.entries(filtered)));
            setLastUpdated(new Date());
          }
        })
        .catch(() => {})
        .finally(() => {
          // Only the latest-generation initial fetch may clear the skeleton.
          // If a newer effect invocation has already incremented the counter,
          // this fetch is superseded and must not dismiss loading early.
          if (!livePriceFetchedOnce.current && myGen === initialFetchGenRef.current) {
            livePriceFetchedOnce.current = true;
            setLivePriceFetching(false);
          }
        });
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchLivePrices();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dbTokens]);

  const allTokens = useMemo(() => {
    const dbRows: TokenRow[] = dbTokens.map(t => {
      const m = liveData.get(t.symbol);
      const rawPrice = m?.priceUsd ?? (t.cached_price != null ? Number(t.cached_price) : null);
      const price = rawPrice != null
        ? (rawPrice >= 1
          ? `$${rawPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `$${rawPrice.toPrecision(4)}`)
        : "—";
      const sourceLabel = m?.source === "binance" ? "Binance"
        : m?.source === "dexscreener" ? "DEX"
        : m?.source === "geckoterminal" ? "GeckoTerminal"
        : m?.source === "coingecko" ? "Live" : null;
      return {
        symbol: t.symbol,
        name: m?.name || t.full_name || t.label || t.symbol,
        pair: `${t.symbol} / USDT`,
        networks: 1,
        price,
        change: Number(m?.changePercent24Hr ?? (t.cached_change_24h != null ? Number(t.cached_change_24h) : 0)),
        activity: sourceLabel ?? "Just added",
        tone: "violet",
        image: m?.image || t.image_url || undefined,
        coingecko_id: t.coingecko_id || undefined,
        db_id: t.id,
        rank: m?.rank ?? (t.cached_rank != null ? Number(t.cached_rank) : undefined),
        price_source: m?.source ?? t.price_source ?? null,
        contract_address: t.contract_address,
        chain: t.chain,
        preferred_exchange: t.preferred_exchange,
        exchange_symbol: t.exchange_symbol,
        exchange_symbol_verified: Boolean(t.exchange_symbol_verified_at),
      };
    });
    return dbRows;
  }, [dbTokens, liveData]);

  const allWallets = useMemo(() => {
    const portfolioRows: WalletRow[] = portfolioWallets.map(w => {
        const totalUsd = w.summary?.totalValueUsd ?? 0;
        const holdings = totalUsd > 0
          ? `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : w.status === "LIVE" || w.status === "LIVE_WITH_WARNINGS" ? "$0.00" : "—";
        const mainNet = w.networks?.[0] ?? "";
        const chain = w.addressType === "solana" ? "Solana"
          : mainNet.includes("eth") ? "Ethereum"
          : mainNet.includes("bnb") ? "BNB Chain"
          : mainNet.includes("base") ? "Base"
          : mainNet.includes("arb") ? "Arbitrum"
          : mainNet.includes("matic") ? "Polygon"
          : mainNet.includes("opt") ? "Optimism"
          : mainNet || "EVM";
        const activity = w.status === "IMPORTING" ? "Importing…"
          : w.status === "ERROR" ? "Error"
          : w.status === "PENDING_IMPORT" ? "Pending"
          : w.lastRefreshAt && walletClock !== null ? `${Math.round((walletClock - new Date(w.lastRefreshAt).getTime()) / 60000)}m ago`
          : "Just added";
        const tone = w.status === "ERROR" ? "red" : w.status === "LIVE" ? "teal" : "gray";
        return {
          short: (w.label || w.address).slice(0, 2).toUpperCase(),
          name: w.label,
          address: w.address,
          chain,
          holdings,
          change: 0,
          activity,
          tone,
          portfolio_id: w.id,
          status: w.status,
          addressType: w.addressType,
        };
      });
    return portfolioRows;
  }, [portfolioWallets, walletClock]);

  const tokens = useMemo(() => allTokens.filter(t => `${t.name} ${t.symbol} ${t.pair}`.toLowerCase().includes(query.toLowerCase())), [allTokens, query]);
  const wallets = useMemo(() => allWallets.filter(w => `${w.name} ${w.address} ${w.chain}`.toLowerCase().includes(query.toLowerCase())), [allWallets, query]);

  const pagedTokens = useMemo(() => tokens.slice((page - 1) * perPage, page * perPage), [tokens, page, perPage]);
  const pagedWallets = useMemo(() => wallets.slice((page - 1) * perPage, page * perPage), [wallets, page, perPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedToken) {
        // No selection yet (initial load or post-delete): pick the first token.
        if (allTokens.length) setSelectedToken(allTokens[0]);
        return;
      }
      const updated = allTokens.find(t => t.db_id === selectedToken.db_id)
        ?? allTokens.find(t => t.symbol === selectedToken.symbol && t.coingecko_id === selectedToken.coingecko_id);
      if (updated) {
        // Keep the selected token in sync with live prices / db changes.
        setSelectedToken(updated);
      } else {
        // The selected token is no longer in the list (was just deleted).
        // Clear the panel; the next allTokens change will auto-select the first
        // remaining token via the !selectedToken branch above.
        setSelectedToken(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!allWallets.length) return;
      if (!selectedWallet) {
        setSelectedWallet(allWallets[0]);
        return;
      }
      const updated = allWallets.find(w => w.address === selectedWallet.address);
      if (updated) setSelectedWallet(updated);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allWallets]); // eslint-disable-line react-hooks/exhaustive-deps


  const saveToken = useCallback(async (data: Record<string, string | number | null>) => {
    await fetch("/api/tracked/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    await refreshTokens();
  }, [refreshTokens]);

  const saveWallet = useCallback(async (data: Record<string, string | number | null>) => {
    const res = await fetch("/api/wallet-portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed to add wallet" }));
      throw new Error(error);
    }
    const newWallet: PortfolioWallet = await res.json();
    await refreshWallets();

    // Background: wait for holdings to load, then auto-add all tokens to watched list
    (async () => {
      const ready = await pollWalletReady(newWallet.id);
      if (!ready?.holdings?.length) return;
      const toImport = ready.holdings.filter(
        h => h.symbol && !h.hiddenByDefault && h.trust !== "low" && h.trust !== "blocked"
      );
      if (!toImport.length) return;
      await Promise.all(
        toImport.map(h =>
          fetch("/api/tracked/tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: h.symbol!.toUpperCase(),
              full_name: h.name ?? null,
              image_url: h.logo ?? null,
              contract_address: h.contractAddress ?? null,
              chain: walletNetworkToChain(h.network),
              wallet_source: newWallet.id,
            }),
          })
        )
      );
      await refreshTokens();
    })();
  }, [refreshWallets, refreshTokens]);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [linkTokenTarget, setLinkTokenTarget] = useState<TokenRow | null>(null);
  const [walletDeletePending, setWalletDeletePending] = useState<WalletDeletePending | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const removeToken = useCallback(async (token: TokenRow) => {
    const target = token.db_id ?? token.symbol;
    const res = await fetch(`/api/tracked/tokens/${encodeURIComponent(target)}`, { method: "DELETE" });
    if (!res.ok) return; // retain state if the server rejected the deletion
    const sameSymbolRemains = dbTokens.some(t => t.id !== token.db_id && t.symbol === token.symbol);
    // Evict from the ref so any in-flight live-price request that resolves
    // before refreshTokens completes cannot reinsert this symbol.
    if (!sameSymbolRemains) trackedSymbolsRef.current.delete(token.symbol);
    // Batch all three evictions into a single React render so no intermediate
    // frame can show a stale price for the deleted token:
    //   1. Remove from dbTokens → allTokens re-derives without this entry.
    //   2. Remove from liveData → price is not readable even via the Map.
    //   3. Clear selectedToken if it was the deleted one → intelligence panel
    //      closes in the same commit; the sync effect will auto-select the
    //      first remaining token on the next allTokens identity change.
    setDbTokens(prev => prev.filter(t => t.id !== token.db_id));
    setLiveData(prev => {
      if (sameSymbolRemains || !prev.has(token.symbol)) return prev;
      const next = new Map(prev);
      next.delete(token.symbol);
      return next;
    });
    if (selectedTokenRef.current?.db_id === token.db_id) {
      setSelectedToken(null);
    }
    await refreshTokens();
    setOpenMenu(null);
  }, [dbTokens, refreshTokens]);

  const linkToken = useCallback(async (target: number | string, data: Record<string, string | number | null>) => {
    const res = await fetch(`/api/tracked/tokens/${encodeURIComponent(target)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Failed to link token (${res.status})`);
    }
    await refreshTokens();
  }, [refreshTokens]);

  const removeWallet = useCallback((portfolioId: string) => {
    // Compute which tokens would be removed by the delete. We replicate the
    // server logic: tokens sourced from this wallet that are NOT also held by
    // any other tracked wallet.
    const otherWallets = portfolioWallets.filter(pw => pw.id !== portfolioId);
    const otherIdentities = new Set(
      otherWallets.flatMap(pw =>
        (pw.holdings ?? [])
          .filter(h => Boolean(h.symbol))
          .map(walletHoldingIdentity)
      )
    );
    const tokensToRemove = dbTokens.filter(
      t => t.wallet_source === portfolioId && !otherIdentities.has(trackedTokenIdentity(t))
    );

    setOpenMenu(null);
    setWalletDeletePending({ portfolioId, tokensToRemove });
  }, [portfolioWallets, dbTokens]);

  const confirmRemoveWallet = useCallback(async (keepTokenIds: number[]) => {
    if (!walletDeletePending) return;
    const { portfolioId } = walletDeletePending;
    await fetch(`/api/wallet-portfolio/${portfolioId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepTokenIds }),
    });
    setWalletDeletePending(null);
    // Refresh both lists: the server removes wallet-sourced tokens during DELETE
    await Promise.all([refreshWallets(), refreshTokens()]);
  }, [walletDeletePending, refreshWallets, refreshTokens]);

  const refreshWallet = useCallback(async (portfolioId: string) => {
    setOpenMenu(null);
    const refreshRes = await fetch(`/api/wallet-portfolio/${portfolioId}/refresh`, { method: "POST" });
    await refreshWallets();

    // Background: wait for the refresh to fully complete, then auto-add any
    // newly acquired tokens. Only runs when the refresh POST succeeded.
    if (!refreshRes.ok) return;
    (async () => {
      const ready = await pollWalletReady(portfolioId);
      // Only import from a successfully completed refresh, not from stale/error data
      if (!ready || (ready.status !== "LIVE" && ready.status !== "LIVE_WITH_WARNINGS")) return;
      if (!ready.holdings?.length) return;

      // Fetch the current tracked-token list fresh so we don't rely on
      // potentially-stale closure state. Only import symbols that are absent.
      const trackedRes = await fetch("/api/tracked/tokens");
      const currentlyTracked: DbToken[] = trackedRes.ok ? await trackedRes.json() : [];
       const trackedIdentities = new Set(currentlyTracked.map(trackedTokenIdentity));

       // Deduplicate strong holdings by chain+contract. Only holdings without a
       // contract identity fall back to symbol-level matching.
      const seen = new Set<string>();
      const candidates = ready.holdings.filter(h => {
        if (!h.symbol) return false;
         const identity = walletHoldingIdentity(h);
         if (seen.has(identity)) return false;
         seen.add(identity);
        return true;
      });

      const toImport = candidates.filter(
        h => !h.hiddenByDefault &&
             h.trust !== "low" &&
             h.trust !== "blocked" &&
              !trackedIdentities.has(walletHoldingIdentity(h))
      );
      if (!toImport.length) return;

      const results = await Promise.all(
        toImport.map(h =>
          fetch("/api/tracked/tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: h.symbol!.toUpperCase(),
              full_name: h.name ?? null,
              image_url: h.logo ?? null,
              contract_address: h.contractAddress ?? null,
              chain: walletNetworkToChain(h.network),
              wallet_source: portfolioId,
            }),
          })
        )
      );
      // Only refresh the token list if at least one import succeeded
      if (results.some(r => r.ok)) await refreshTokens();
    })();
  }, [refreshWallets, refreshTokens]);

  const editTokenLabel = useCallback(async (token: TokenRow, currentLabel: string) => {
    setOpenMenu(null);
    const next = window.prompt("Edit label:", currentLabel);
    if (next === null) return;
    await fetch(`/api/tracked/tokens/${encodeURIComponent(token.db_id ?? token.symbol)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: next }),
    });
    await refreshTokens();
  }, [refreshTokens]);

  const editWalletLabel = useCallback(async (portfolioId: string, currentLabel: string) => {
    setOpenMenu(null);
    const next = window.prompt("Edit label:", currentLabel);
    if (next === null) return;
    await fetch(`/api/wallet-portfolio/${portfolioId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: next }) });
    await refreshWallets();
  }, [refreshWallets]);

  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setToast(`Copied ${label}`);
      window.setTimeout(() => setToast(""), 2400);
    });
    setOpenMenu(null);
  }, []);

  const openTokenInMarkets = useCallback((token: TokenRow) => {
    setOpenMenu(null);
    onOpenInMarkets({
      tokenId: token.db_id,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      exchangeVerified: token.exchange_symbol_verified,
      preferredExchange: token.exchange_symbol_verified ? token.preferred_exchange || undefined : undefined,
      exchangeSymbol: token.exchange_symbol_verified ? token.exchange_symbol || undefined : undefined,
      chain: token.chain || undefined,
      contractAddress: token.contract_address || undefined,
      coingeckoId: token.coingecko_id || undefined,
      source: "monitor",
    });
  }, [onOpenInMarkets]);

  const switchTab = (nextTab: TrackingTab) => { setTab(nextTab); setQuery(""); setPage(1); };
  const updateQuery = (value: string) => { setQuery(value); setPage(1); };

  const finishDialog = (message: string) => {
    setDialog(null);
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  return (
    <div className="tracking-page">
      <div className="tracking-scroll-area">
      <header className="tracking-page-header">
        <div><h1>Asset Tracking</h1><p>Track watched tokens and wallets from one focused workspace.</p></div>
        <div className="tracking-header-actions"><button type="button" onClick={() => setDialog("tokens")}>＋ Add Token</button><button type="button" onClick={() => setDialog("wallets")}>＋ Add Wallet</button><button type="button" onClick={() => fileInput.current?.click()}>⇧ Import List</button><input ref={fileInput} type="file" accept=".csv,.txt" aria-label="Import asset list" hidden onChange={() => setToast("Import selected for this interface preview.")} /></div>
      </header>

      <div className="tracking-workspace">
        <main className="tracking-main-panel">
          <div className="tracking-tabs" role="tablist" aria-label="Asset tracking views"><button className={tab === "tokens" ? "active" : ""} type="button" role="tab" aria-selected={tab === "tokens"} onClick={() => switchTab("tokens")}>◎ Watched Tokens</button><button className={tab === "wallets" ? "active" : ""} type="button" role="tab" aria-selected={tab === "wallets"} onClick={() => switchTab("wallets")}>▱ Watched Wallets</button></div>
          <div className="tracking-toolbar"><label><span aria-hidden="true">⌕</span><input type="search" placeholder={tab === "tokens" ? "Search tokens..." : "Search wallets..."} value={query} onChange={(event) => updateQuery(event.target.value)} /></label><div><button type="button">☷ Filters</button></div></div>

          {tab === "tokens" && secondsSinceUpdate !== null && (
            <p className="tracking-last-updated" aria-live="polite">
              Updated {secondsSinceUpdate < 5 ? "just now" : `${secondsSinceUpdate}s ago`}
            </p>
          )}
          <div className="tracking-table-wrap">
            {tab === "tokens" ? (
              <div className="tracking-table token-table">
                <div className="tracking-table-head"><span>Token / Pair</span><span>Networks</span><span>Price</span><span>24H Change</span><span>Last Activity</span><span>Actions</span></div>
                <div className="tracking-table-body">
                {pagedTokens.map((token) => {
                  const geckoUrl = token.coingecko_id ? `https://www.coingecko.com/en/coins/${token.coingecko_id}` : null;
                  const menuKey = `t-${token.db_id ?? `${token.symbol}-${token.chain ?? "unknown"}`}`;
                  return (
                    <div className={`tracking-table-row ${selectedToken?.db_id === token.db_id ? "selected" : ""}`} key={token.db_id ?? menuKey} role="row" tabIndex={0} onClick={() => setSelectedToken(token)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedToken(token); } }}>
                      <span className="tracking-name-cell">{token.image ? <img src={token.image} alt={token.symbol} className="tracking-coin-img" /> : <AssetBadge label={token.symbol} tone={token.tone} />}<b>{token.name}<small>{token.pair}</small></b></span>
                      <span>{token.networks} networks</span>
                      <strong>
                        {!token.price_source && token.price === "—"
                          ? (
                            <button
                              className="tracking-no-source-badge"
                              type="button"
                              title="No price source linked — click to link market data"
                              onClick={e => { e.stopPropagation(); setLinkTokenTarget(token); }}
                            >
                              ⚠ No source
                            </button>
                          )
                          : token.price}
                      </strong>
                      <Change value={token.change} />
                      <span className="tracking-activity"><i />{token.activity}</span>
                      <span className="tracking-row-actions">
                        {geckoUrl && <a className="tracking-action-btn" href={geckoUrl} target="_blank" rel="noreferrer" title="View on CoinGecko" onClick={e => e.stopPropagation()}>↗</a>}
                        {token.db_id != null && (
                          <span className="tracking-action-menu-wrap">
                            <button className="tracking-action-btn" type="button" title="More options" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === menuKey ? null : menuKey); }}>•••</button>
                            {openMenu === menuKey && (
                              <div className="tracking-action-menu">
                                <button type="button" aria-label={`Open ${token.name} in Markets`} onClick={event => { event.stopPropagation(); openTokenInMarkets(token); }}>◉ Open in Markets →</button>
                                <button type="button" onClick={event => { event.stopPropagation(); editTokenLabel(token, token.name); }}>✎ Edit Label</button>
                                <button type="button" onClick={event => { event.stopPropagation(); copy(token.symbol, "symbol"); }}>⎘ Copy Symbol</button>
                                {geckoUrl && <a className="tracking-menu-link" href={geckoUrl} target="_blank" rel="noreferrer" onClick={event => { event.stopPropagation(); setOpenMenu(null); }}>↗ View on CoinGecko</a>}
                                {(token.coingecko_id || token.price_source) ? (
                                  <button type="button" onClick={event => { event.stopPropagation(); setOpenMenu(null); setLinkTokenTarget(token); }}>⇄ Change price source</button>
                                ) : (
                                  <button type="button" onClick={event => { event.stopPropagation(); setOpenMenu(null); setLinkTokenTarget(token); }}>↗ Link Market Data</button>
                                )}
                                <hr />
                                <button type="button" className="tracking-menu-delete" onClick={event => { event.stopPropagation(); removeToken(token); }}>🗑 Delete Token</button>
                              </div>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {!tokens.length && <div className="tracking-empty">No watched tokens match that search.</div>}
                </div>
              </div>
            ) : (
              <div className={`tracking-table wallet-table${!alchemyConfigured ? " has-api-notice" : ""}`}>
                {!alchemyConfigured && (
                  <div className="tracking-api-notice">
                    ⚠ <strong>ALCHEMY_API_KEY not set</strong> — wallets can be added but holdings won&apos;t be fetched until you add the secret.
                  </div>
                )}
                <div className="tracking-table-head"><span>Wallet / Label</span><span>Chain</span><span>Holdings (USD)</span><span>Status</span><span>Last Activity</span><span>Actions</span></div>
                <div className="tracking-table-body">
                {pagedWallets.map((wallet) => {
                  const explorerUrl = wallet.addressType === "solana" || wallet.chain === "Solana"
                    ? `https://solscan.io/account/${wallet.address}`
                    : `https://etherscan.io/address/${wallet.address}`;
                  const menuKey = `w-${wallet.address}`;
                  const statusDot = wallet.status === "LIVE" ? "●" : wallet.status === "LIVE_WITH_WARNINGS" ? "◐" : wallet.status === "ERROR" ? "✕" : wallet.status === "IMPORTING" ? "⟳" : "○";
                  const statusColor = wallet.status === "LIVE" ? "#7dd87d" : wallet.status === "ERROR" ? "#e05555" : "#8899aa";
                  return (
                    <div className={`tracking-table-row ${selectedWallet?.address === wallet.address ? "selected" : ""}`} key={wallet.address} role="row" tabIndex={0} onClick={() => setSelectedWallet(wallet)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedWallet(wallet); } }}>
                      <span className="tracking-name-cell"><AssetBadge label={wallet.short} tone={wallet.tone} /><b>{wallet.name}<small>{wallet.address}</small></b></span>
                      <span className="tracking-chain">◆ {wallet.chain}</span>
                      <strong>{wallet.holdings}</strong>
                      <span style={{ color: statusColor, fontSize: 12 }}>{statusDot} {wallet.status ? wallet.status.replace(/_/g, " ") : "—"}</span>
                      <span className="tracking-activity"><i />{wallet.activity}</span>
                      <span className="tracking-row-actions">
                        <a className="tracking-action-btn" href={explorerUrl} target="_blank" rel="noreferrer" title="View in explorer" onClick={e => e.stopPropagation()}>↗</a>
                        {wallet.portfolio_id != null && (
                          <span className="tracking-action-menu-wrap">
                            <button className="tracking-action-btn" type="button" title="More options" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === menuKey ? null : menuKey); }}>•••</button>
                            {openMenu === menuKey && (
                              <div className="tracking-action-menu">
                                <button type="button" onClick={event => { event.stopPropagation(); refreshWallet(wallet.portfolio_id!); }}>⟳ Refresh Holdings</button>
                                <button type="button" onClick={event => { event.stopPropagation(); editWalletLabel(wallet.portfolio_id!, wallet.name); }}>✎ Edit Label</button>
                                <button type="button" onClick={event => { event.stopPropagation(); copy(wallet.address, "address"); }}>⎘ Copy Address</button>
                                <a className="tracking-menu-link" href={explorerUrl} target="_blank" rel="noreferrer" onClick={event => { event.stopPropagation(); setOpenMenu(null); }}>↗ View in Explorer</a>
                                <hr />
                                <button type="button" className="tracking-menu-delete" onClick={event => { event.stopPropagation(); removeWallet(wallet.portfolio_id!); }}>🗑 Delete Wallet</button>
                              </div>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {!wallets.length && <div className="tracking-empty">No watched wallets match that search.</div>}
                </div>
              </div>
            )}
          </div>
          {(() => {
            const totalItems = tab === "tokens" ? tokens.length : wallets.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
            const firstItem = totalItems === 0 ? 0 : (page - 1) * perPage + 1;
            const lastItem = Math.min(page * perPage, totalItems);
            const label = tab === "tokens" ? "tokens" : "wallets";
            return (
              <footer className="tracking-table-footer">
                <span>Showing {firstItem}–{lastItem} of {totalItems} {label}</span>
                <div>
                  <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} className={p === page ? "active" : ""} type="button" onClick={() => setPage(p)}>{p}</button>
                  ))}
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
                </div>
                <div className="tracking-perpage-wrap">
                  <button type="button" onClick={() => setPerPageOpen(o => !o)}>Show {perPage} per page ⌄</button>
                  {perPageOpen && (
                    <div className="tracking-perpage-menu">
                      {[8, 16, 24, 50].map(n => (
                        <button key={n} type="button" className={n === perPage ? "active" : ""} onClick={() => { setPerPage(n); setPage(1); setPerPageOpen(false); }}>{n} per page</button>
                      ))}
                    </div>
                  )}
                </div>
              </footer>
            );
          })()}
        </main>
        {tab === "tokens"
          ? selectedToken ? <TokenIntelligence token={selectedToken} priceLoading={livePriceFetching} onLinkMarketData={() => setLinkTokenTarget(selectedToken)} onOpenInMarkets={() => openTokenInMarkets(selectedToken)} /> : <aside className="tracking-intelligence tracking-intelligence-empty"><p>Add a token to see intelligence here.</p></aside>
          : selectedWallet ? <WalletIntelligence wallet={selectedWallet} portfolioWallet={portfolioWallets.find(pw => pw.id === selectedWallet.portfolio_id)} /> : <aside className="tracking-intelligence tracking-intelligence-empty"><p>Add a wallet to see intelligence here.</p></aside>}
      </div>
      </div>{/* end tracking-scroll-area */}
      {toast && <div className="tracking-toast" role="status">✓ {toast}</div>}
      {dialog && <TrackingDialog kind={dialog} close={() => setDialog(null)} finish={finishDialog} onSave={dialog === "tokens" ? saveToken : saveWallet} />}
      {walletDeletePending && (
        <WalletDeleteDialog
          pending={walletDeletePending}
          onConfirm={confirmRemoveWallet}
          onCancel={() => setWalletDeletePending(null)}
        />
      )}
      {linkTokenTarget && (
        <TrackingDialog
          kind="tokens"
          mode="link"
          initialSearch={linkTokenTarget.symbol}
          close={() => setLinkTokenTarget(null)}
          finish={(msg) => { setLinkTokenTarget(null); setToast(msg); window.setTimeout(() => setToast(""), 3200); }}
          onSave={async (data) => {
            const coinFields = Object.fromEntries(
              Object.entries(data).filter(([key]) => key !== "symbol" && key !== "label"),
            );
            await linkToken(linkTokenTarget.db_id ?? linkTokenTarget.symbol, coinFields);
          }}
        />
      )}
    </div>
  );
}
