"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TRACKED_STORAGE_KEY = "signal-control:tracked-tokens";
const TRACKED_CHANGED_EVENT = "signal-control:tracked-tokens-changed";

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
  binance_pair: string | null; pair_address: string | null;
};
type PortfolioWallet = {
  id: string; address: string; addressType: "evm" | "solana"; label: string;
  networks: string[]; createdAt: string; updatedAt: string; lastRefreshAt: string | null;
  status: "PENDING_IMPORT" | "IMPORTING" | "LIVE" | "LIVE_WITH_WARNINGS" | "STALE" | "ERROR";
  summary: { totalTokens: number; visibleTokens: number; totalValueUsd: number; valueCoverageComplete: boolean };
  holdings: Array<{ network: string; symbol: string | null; name: string | null; balance: number; priceUsd: number | null; valueUsd: number | null; logo: string | null; trust: string; hiddenByDefault: boolean }>;
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
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
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
          } : {}),
        });
        finish(symbol
          ? (mode === "link" ? `${symbol} linked to CoinGecko.` : `${symbol} added to your tracked tokens.`)
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
                  autoFocus
                />
                <i aria-hidden="true">{searching ? "…" : "⌕"}</i>
              </div>
              {results.length > 0 && (
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
            ⚠ No CoinGecko match selected — price data won't be available. Pick a result from the list to enable live prices, or click "Add anyway" to continue without prices.
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

function TokenIntelligence({ token }: { token: TokenRow }) {
  const geckoUrl = token.coingecko_id
    ? `https://www.coingecko.com/en/coins/${token.coingecko_id}`
    : null;
  return (
    <aside className="tracking-intelligence">
      <header><span>Selected Token Intelligence</span><button type="button" aria-label="Close selected token">×</button></header>
      <div className="tracking-selected-identity">
        {token.image
          ? <img src={token.image} alt={token.symbol} width={28} height={28} className="tracking-coin-img" />
          : <AssetBadge label={token.symbol} tone={token.tone} />}
        <div><h2>{token.name} {token.symbol}</h2><small>{token.pair} · {token.networks} network{token.networks !== 1 ? "s" : ""}</small></div>
        <b className="tracking-active-pill">● Active</b>
      </div>
      <div className="tracking-hero-stats">
        <span><small>Price</small><strong>{token.price}</strong><Change value={token.change} /></span>
        <span><small>Last Activity</small><strong className="tracking-activity"><i /> {token.activity}</strong></span>
      </div>
      <div className="tracking-detail-actions">
        {geckoUrl
          ? <a className="tracking-primary tracking-action-link" href={geckoUrl} target="_blank" rel="noreferrer">Open on CoinGecko ↗</a>
          : <button className="tracking-primary" type="button" disabled>Open Market</button>}
        <button type="button">View Contract ↗</button>
      </div>
      <div className="tracking-facts">
        <span><small>Networks</small><strong>{token.networks}</strong></span>
        <span><small>Pair</small><strong>{token.pair}</strong></span>
        {token.rank != null && <span><small>Rank</small><strong>#{token.rank}</strong></span>}
        <span><small>Status</small><strong>Watching</strong></span>
      </div>
      <section className="tracking-side-card">
        <h3>Monitoring Summary</h3>
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
      <header><span>Selected Wallet Intelligence</span><button type="button" aria-label="Close selected wallet">×</button></header>
      <div className="tracking-selected-identity">
        <AssetBadge label={wallet.short} tone={wallet.tone} />
        <div><h2>{wallet.name}</h2><small>{wallet.address}</small></div>
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
    </aside>
  );
}

export default function AssetTrackingView() {
  const [tab, setTab] = useState<TrackingTab>("tokens");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [query, setQuery] = useState("");
  const [dbTokens, setDbTokens] = useState<DbToken[]>([]);
  const [portfolioWallets, setPortfolioWallets] = useState<PortfolioWallet[]>([]);
  const [alchemyConfigured, setAlchemyConfigured] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenRow | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshTokens = useCallback(() =>
    fetch("/api/tracked/tokens")
      .then(r => r.ok ? r.json() : [])
      .then((tokens: DbToken[]) => {
        setDbTokens(tokens);
        const symbols = tokens.map((t: DbToken) => t.symbol);
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

  useEffect(() => {
    if (!dbTokens.length) return;
    fetch("/api/coins/live-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: dbTokens }),
    })
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, LivePrice>) => setLiveData(new Map(Object.entries(data))))
      .catch(() => {});
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
          : w.lastRefreshAt ? `${Math.round((Date.now() - new Date(w.lastRefreshAt).getTime()) / 60000)}m ago`
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
  }, [portfolioWallets]);

  const tokens = useMemo(() => allTokens.filter(t => `${t.name} ${t.symbol} ${t.pair}`.toLowerCase().includes(query.toLowerCase())), [allTokens, query]);
  const wallets = useMemo(() => allWallets.filter(w => `${w.name} ${w.address} ${w.chain}`.toLowerCase().includes(query.toLowerCase())), [allWallets, query]);

  useEffect(() => {
    if (!allTokens.length) return;
    if (!selectedToken) { setSelectedToken(allTokens[0]); return; }
    const updated = allTokens.find(t => t.symbol === selectedToken.symbol);
    if (updated) setSelectedToken(updated);
  }, [allTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!allWallets.length) return;
    if (!selectedWallet) { setSelectedWallet(allWallets[0]); return; }
    const updated = allWallets.find(w => w.address === selectedWallet.address);
    if (updated) setSelectedWallet(updated);
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
    await refreshWallets();
  }, [refreshWallets]);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [linkTokenSymbol, setLinkTokenSymbol] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const removeToken = useCallback(async (symbol: string) => {
    await fetch(`/api/tracked/tokens/${encodeURIComponent(symbol)}`, { method: "DELETE" });
    await refreshTokens();
    setOpenMenu(null);
  }, [refreshTokens]);

  const linkToken = useCallback(async (symbol: string, data: Record<string, string | number | null>) => {
    const res = await fetch(`/api/tracked/tokens/${encodeURIComponent(symbol)}`, {
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

  const removeWallet = useCallback(async (portfolioId: string) => {
    await fetch(`/api/wallet-portfolio/${portfolioId}`, { method: "DELETE" });
    await refreshWallets();
    setOpenMenu(null);
  }, [refreshWallets]);

  const refreshWallet = useCallback(async (portfolioId: string) => {
    setOpenMenu(null);
    await fetch(`/api/wallet-portfolio/${portfolioId}/refresh`, { method: "POST" });
    await refreshWallets();
  }, [refreshWallets]);

  const editTokenLabel = useCallback(async (symbol: string, currentLabel: string) => {
    setOpenMenu(null);
    const next = window.prompt("Edit label:", currentLabel);
    if (next === null) return;
    await fetch("/api/tracked/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, label: next }) });
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

  const switchTab = (nextTab: TrackingTab) => { setTab(nextTab); setQuery(""); };

  const finishDialog = (message: string) => {
    setDialog(null);
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  return (
    <div className="tracking-page">
      <header className="tracking-page-header">
        <div><p className="tracking-breadcrumb">Asset Tracking <b>›</b> <strong>Overview</strong></p><h1>Monitor Center</h1><p>Track watched tokens and wallets from one focused workspace.</p><small>Interface preview · External asset intelligence is not connected yet.</small></div>
        <div className="tracking-header-actions"><button className="tracking-primary" type="button" onClick={() => setDialog("tokens")}>＋ Add Token</button><button type="button" onClick={() => setDialog("wallets")}>＋ Add Wallet</button><button type="button" onClick={() => fileInput.current?.click()}>⇧ Import List</button><input ref={fileInput} type="file" accept=".csv,.txt" aria-label="Import asset list" hidden onChange={() => setToast("Import selected for this interface preview.")} /></div>
      </header>

      <div className="tracking-workspace">
        <main className="tracking-main-panel">
          <div className="tracking-tabs" role="tablist" aria-label="Asset tracking views"><button className={tab === "tokens" ? "active" : ""} type="button" role="tab" aria-selected={tab === "tokens"} onClick={() => switchTab("tokens")}>◎ Watched Tokens</button><button className={tab === "wallets" ? "active" : ""} type="button" role="tab" aria-selected={tab === "wallets"} onClick={() => switchTab("wallets")}>▱ Watched Wallets</button></div>
          <div className="tracking-toolbar"><label><span aria-hidden="true">⌕</span><input type="search" placeholder={tab === "tokens" ? "Search tokens..." : "Search wallets..."} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div><button type="button">All Chains ⌄</button><button type="button">Status: Active ⌄</button><button type="button">☷ Filters</button><button className="tracking-view-toggle" type="button" aria-label="List view">☷</button></div></div>

          <div className="tracking-table-wrap">
            {tab === "tokens" ? (
              <div className="tracking-table token-table">
                <div className="tracking-table-head"><span>Token / Pair</span><span>Networks</span><span>Price</span><span>24H Change</span><span>Last Activity</span><span>Actions</span></div>
                {tokens.map((token) => {
                  const geckoUrl = `https://www.coingecko.com/en/coins/${token.coingecko_id ?? token.symbol.toLowerCase()}`;
                  const menuKey = `t-${token.symbol}`;
                  return (
                    <div className={`tracking-table-row ${selectedToken?.symbol === token.symbol ? "selected" : ""}`} key={token.symbol} role="row" onClick={() => setSelectedToken(token)}>
                      <span className="tracking-name-cell">{token.image ? <img src={token.image} alt={token.symbol} className="tracking-coin-img" /> : <AssetBadge label={token.symbol} tone={token.tone} />}<b>{token.name}<small>{token.pair}</small></b></span>
                      <span>{token.networks} networks</span>
                      <strong>{token.price}</strong>
                      <Change value={token.change} />
                      <span className="tracking-activity"><i />{token.activity}</span>
                      <span className="tracking-row-actions" onClick={e => e.stopPropagation()}>
                        <span className="tracking-action-monitor" title="Monitoring active">◉</span>
                        <a className="tracking-action-btn" href={geckoUrl} target="_blank" rel="noreferrer" title="View on CoinGecko" onClick={e => e.stopPropagation()}>↗</a>
                        {token.db_id != null && (
                          <span className="tracking-action-menu-wrap">
                            <button className="tracking-action-btn" type="button" title="More options" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === menuKey ? null : menuKey); }}>•••</button>
                            {openMenu === menuKey && (
                              <div className="tracking-action-menu" onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={() => editTokenLabel(token.symbol, token.name)}>✎ Edit Label</button>
                                <button type="button" onClick={() => copy(token.symbol, "symbol")}>⎘ Copy Symbol</button>
                                <a className="tracking-menu-link" href={`https://www.coingecko.com/en/coins/${token.coingecko_id ?? token.symbol.toLowerCase()}`} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>↗ View on CoinGecko</a>
                                {!token.coingecko_id && (
                                  <button type="button" onClick={() => { setOpenMenu(null); setLinkTokenSymbol(token.symbol); }}>↗ Link Market Data</button>
                                )}
                                <hr />
                                <button type="button" className="tracking-menu-delete" onClick={() => removeToken(token.symbol)}>🗑 Delete Token</button>
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
            ) : (
              <div className="tracking-table wallet-table">
                {!alchemyConfigured && (
                  <div className="tracking-api-notice">
                    ⚠ <strong>ALCHEMY_API_KEY not set</strong> — wallets can be added but holdings won&apos;t be fetched until you add the secret.
                  </div>
                )}
                <div className="tracking-table-head"><span>Wallet / Label</span><span>Chain</span><span>Holdings (USD)</span><span>Status</span><span>Last Activity</span><span>Actions</span></div>
                {wallets.map((wallet) => {
                  const explorerUrl = wallet.addressType === "solana" || wallet.chain === "Solana"
                    ? `https://solscan.io/account/${wallet.address}`
                    : `https://etherscan.io/address/${wallet.address}`;
                  const menuKey = `w-${wallet.address}`;
                  const statusDot = wallet.status === "LIVE" ? "●" : wallet.status === "LIVE_WITH_WARNINGS" ? "◐" : wallet.status === "ERROR" ? "✕" : wallet.status === "IMPORTING" ? "⟳" : "○";
                  const statusColor = wallet.status === "LIVE" ? "#7dd87d" : wallet.status === "ERROR" ? "#e05555" : "#8899aa";
                  return (
                    <div className={`tracking-table-row ${selectedWallet?.address === wallet.address ? "selected" : ""}`} key={wallet.address} role="row" onClick={() => setSelectedWallet(wallet)}>
                      <span className="tracking-name-cell"><AssetBadge label={wallet.short} tone={wallet.tone} /><b>{wallet.name}<small>{wallet.address}</small></b></span>
                      <span className="tracking-chain">◆ {wallet.chain}</span>
                      <strong>{wallet.holdings}</strong>
                      <span style={{ color: statusColor, fontSize: 12 }}>{statusDot} {wallet.status ? wallet.status.replace(/_/g, " ") : "—"}</span>
                      <span className="tracking-activity"><i />{wallet.activity}</span>
                      <span className="tracking-row-actions" onClick={e => e.stopPropagation()}>
                        <span className="tracking-action-monitor" title="Monitoring active" style={{ color: statusColor }}>◉</span>
                        <a className="tracking-action-btn" href={explorerUrl} target="_blank" rel="noreferrer" title="View in explorer" onClick={e => e.stopPropagation()}>↗</a>
                        {wallet.portfolio_id != null && (
                          <span className="tracking-action-menu-wrap">
                            <button className="tracking-action-btn" type="button" title="More options" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === menuKey ? null : menuKey); }}>•••</button>
                            {openMenu === menuKey && (
                              <div className="tracking-action-menu" onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={() => refreshWallet(wallet.portfolio_id!)}>⟳ Refresh Holdings</button>
                                <button type="button" onClick={() => editWalletLabel(wallet.portfolio_id!, wallet.name)}>✎ Edit Label</button>
                                <button type="button" onClick={() => copy(wallet.address, "address")}>⎘ Copy Address</button>
                                <a className="tracking-menu-link" href={explorerUrl} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>↗ View in Explorer</a>
                                <hr />
                                <button type="button" className="tracking-menu-delete" onClick={() => removeWallet(wallet.portfolio_id!)}>🗑 Delete Wallet</button>
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
            )}
          </div>
          <footer className="tracking-table-footer"><span>Showing 1 to {tab === "tokens" ? tokens.length : wallets.length} of {tab === "tokens" ? allTokens.length : allWallets.length} {tab}</span><div><button type="button">‹</button><button className="active" type="button">1</button><button type="button">2</button><button type="button">›</button></div><button type="button">Show 8 per page ⌄</button></footer>
        </main>
        {tab === "tokens"
          ? selectedToken ? <TokenIntelligence token={selectedToken} /> : <aside className="tracking-intelligence tracking-intelligence-empty"><p>Add a token to see intelligence here.</p></aside>
          : selectedWallet ? <WalletIntelligence wallet={selectedWallet} portfolioWallet={portfolioWallets.find(pw => pw.id === selectedWallet.portfolio_id)} /> : <aside className="tracking-intelligence tracking-intelligence-empty"><p>Add a wallet to see intelligence here.</p></aside>}
      </div>
      {toast && <div className="tracking-toast" role="status">✓ {toast}</div>}
      {dialog && <TrackingDialog kind={dialog} close={() => setDialog(null)} finish={finishDialog} onSave={dialog === "tokens" ? saveToken : saveWallet} />}
      {linkTokenSymbol && (
        <TrackingDialog
          kind="tokens"
          mode="link"
          initialSearch={linkTokenSymbol}
          close={() => setLinkTokenSymbol(null)}
          finish={(msg) => { setLinkTokenSymbol(null); setToast(msg); window.setTimeout(() => setToast(""), 3200); }}
          onSave={async (data) => {
            const { symbol: _sym, label: _lbl, ...coinFields } = data;
            await linkToken(linkTokenSymbol, coinFields);
          }}
        />
      )}
    </div>
  );
}
