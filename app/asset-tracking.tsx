"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CoinResult = { id: string; symbol: string; name: string; priceUsd: string; changePercent24Hr: string; rank: string; image?: string };
type MarketEntry = { id: string; symbol: string; name: string; priceUsd: number; changePercent24Hr: number; rank: number; image: string };
type DbToken = {
  id: number; symbol: string; label: string | null; created_at: string;
  coingecko_id: string | null; image_url: string | null; full_name: string | null;
  cached_price: number | null; cached_change_24h: number | null; cached_rank: number | null;
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

const TOKENS: TokenRow[] = [
  { symbol: "ETH", name: "Ethereum", pair: "ETH / USD", networks: 3, price: "$3,842.16", change: 4.21, activity: "2m ago", tone: "violet" },
  { symbol: "USDT", name: "Tether", pair: "USDT / USD", networks: 5, price: "$1.00", change: 0.16, activity: "7m ago", tone: "teal" },
  { symbol: "BTC", name: "Bitcoin", pair: "BTC / USD", networks: 2, price: "$64,190.30", change: -1.34, activity: "11m ago", tone: "orange" },
  { symbol: "SOL", name: "Solana", pair: "SOL / USD", networks: 2, price: "$128.47", change: 6.72, activity: "9m ago", tone: "indigo" },
  { symbol: "LINK", name: "Chainlink", pair: "LINK / USD", networks: 4, price: "$13.88", change: 2.11, activity: "15m ago", tone: "blue" },
  { symbol: "ARB", name: "Arbitrum", pair: "ARB / USD", networks: 3, price: "$0.44", change: -0.45, activity: "18m ago", tone: "sky" },
  { symbol: "UNI", name: "Uniswap", pair: "UNI / USD", networks: 2, price: "$6.12", change: 3.88, activity: "21m ago", tone: "pink" },
  { symbol: "SUI", name: "Sui", pair: "SUI / USD", networks: 2, price: "$0.92", change: 5.21, activity: "31m ago", tone: "cyan" },
];

const WALLETS: WalletRow[] = [
  { short: "BN", name: "Binance: Hot Wallet 0x28C6", address: "0x28C6c06298d514Db089934071355E5743bf21d60", chain: "Ethereum", holdings: "$2.43B", change: 4.21, activity: "2m ago", tone: "gold" },
  { short: "JT", name: "Jump Trading: 0x1756", address: "0x1756599cAEbE663aD60a29D4e7af2d5a6c95aD63", chain: "Ethereum", holdings: "$1.67B", change: -1.18, activity: "7m ago", tone: "silver" },
  { short: "C", name: "Coinbase: Custody 0xF977", address: "0xF977814e90dA44bFA03b6295A0616a897441aceC", chain: "Ethereum", holdings: "$1.21B", change: 2.75, activity: "11m ago", tone: "blue" },
  { short: "OK", name: "OKX: Hot Wallet", address: "0x29b38cA47a17cFCc24a6f6a6d4F8d2c6b6d5A2f8", chain: "Arbitrum", holdings: "$842.35M", change: 0.93, activity: "15m ago", tone: "black" },
  { short: "W", name: "Wintermute: 0x9a19", address: "0x9a190d33D7bF0E4fE03bA8eC17C8c9c4Bf2f6a6e", chain: "Ethereum", holdings: "$652.91M", change: -0.67, activity: "18m ago", tone: "teal" },
  { short: "M", name: "MetaMask: Deployer", address: "0xDfb9e3c1a2a4C5f3D9e8A1b2C3d4E5f678901234", chain: "Polygon", holdings: "$118.46M", change: 3.31, activity: "23m ago", tone: "violet" },
  { short: "G", name: "Gnosis Safe: Treasury", address: "0x1234567890abcdef1234567890abcdef12345678", chain: "Ethereum", holdings: "$97.12M", change: -2.11, activity: "27m ago", tone: "gray" },
  { short: "D", name: "Dragonfly Capital: 0x88A", address: "0x88a41e0fA3a5eA9f7b8C5c8f3dB2a1d4E6f7a8b9", chain: "Base", holdings: "$45.88M", change: 1.04, activity: "31m ago", tone: "yellow" },
];

function AssetBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`tracking-asset-badge ${tone}`} aria-hidden="true">{label}</span>;
}

function Change({ value }: { value: number }) {
  return <span className={value >= 0 ? "tracking-positive" : "tracking-negative"}>{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

function CoinIcon({ symbol, imageUrl }: { symbol: string; imageUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl || `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
  if (failed) return <span className="tracking-coin-letter">{symbol.slice(0, 1)}</span>;
  return <img src={src} alt={symbol} width={28} height={28} className="tracking-coin-img" onError={() => setFailed(true)} />;
}

function TrackingDialog({ kind, close, finish, onSave }: {
  kind: Exclude<DialogKind, null>;
  close: () => void;
  finish: (message: string) => void;
  onSave?: (data: Record<string, string | number | null>) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CoinResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<CoinResult | null>(null);
  const [label, setLabel] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChain, setWalletChain] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

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
    if (!label) setLabel(coin.name);
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (kind === "tokens") {
        const symbol = (selectedCoin?.symbol ?? search.trim()).toUpperCase();
        if (symbol && onSave) await onSave({
          symbol, label,
          ...(selectedCoin ? {
            coingecko_id: selectedCoin.id,
            image_url: selectedCoin.image ?? null,
            full_name: selectedCoin.name,
            cached_price: parseFloat(selectedCoin.priceUsd),
            cached_change_24h: parseFloat(selectedCoin.changePercent24Hr),
            cached_rank: parseInt(selectedCoin.rank, 10),
          } : {}),
        });
        finish(symbol ? `${symbol} added to your tracked tokens.` : "Token added to your watchlist.");
      } else {
        const address = walletAddress.trim();
        if (address && onSave) await onSave({ address, label, chain: walletChain, notes });
        finish(address ? `Wallet ${address.slice(0, 8)}… added to your watchlist.` : "Wallet added to your watchlist.");
      }
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
          <div><span className="tracking-dialog-mark" aria-hidden="true">◎</span><h2 id="tracking-dialog-title">Add New {kind === "tokens" ? "Token" : "Wallet"}</h2></div>
          <button type="button" aria-label="Close dialog" onClick={close}>×</button>
        </header>
        <p>{kind === "tokens" ? "Add a token or trading pair to your monitored assets." : "Add a wallet address to your monitored assets."}</p>

        {kind === "tokens" ? (
          <>
            <label className="tracking-dialog-field">
              <span>Search Token or Paste Contract</span>
              <div className="tracking-input-with-icon">
                <input
                  type="search"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedCoin(null); }}
                  placeholder="Search by token name, symbol, or contract address..."
                  autoComplete="off"
                  autoFocus
                />
                <i aria-hidden="true">{searching ? "…" : "⌕"}</i>
              </div>
              {results.length > 0 && (
                <ul className="tracking-coin-results" role="listbox">
                  {results.map(coin => (
                    <li key={coin.id} role="option" aria-selected={false}>
                      <button type="button" onClick={() => pickCoin(coin)}>
                        <CoinIcon symbol={coin.symbol} imageUrl={coin.image} />
                        <span className="tracking-coin-info">
                          <strong>{coin.symbol}</strong>
                          <small>{coin.name}</small>
                        </span>
                        <span className="tracking-coin-meta">
                          <b>${parseFloat(coin.priceUsd) >= 1
                            ? parseFloat(coin.priceUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : parseFloat(coin.priceUsd).toPrecision(4)}</b>
                          <em className={parseFloat(coin.changePercent24Hr) >= 0 ? "tracking-positive" : "tracking-negative"}>
                            {parseFloat(coin.changePercent24Hr) >= 0 ? "+" : ""}{parseFloat(coin.changePercent24Hr).toFixed(2)}%
                          </em>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <small>Supports a token name, symbol, or contract address.</small>
            </label>
            {selectedCoin && (
              <div className="tracking-token-result">
                <CoinIcon symbol={selectedCoin.symbol} imageUrl={selectedCoin.image} />
                <span>
                  <strong>{selectedCoin.name} <b className="tracking-positive">✓</b></strong>
                  <small>{selectedCoin.symbol} · Rank #{selectedCoin.rank}</small>
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
        <footer>
          <button className="tracking-cancel" type="button" onClick={close} disabled={saving}>Cancel</button>
          <button className="tracking-primary" type="submit" disabled={saving}>{saving ? "Saving…" : `Add ${kind === "tokens" ? "Token" : "Wallet"}`}</button>
        </footer>
      </form>
    </div>
  );
}

function TokenIntelligence({ token }: { token: TokenRow }) {
  return (
    <aside className="tracking-intelligence">
      <header><span>Selected Token Intelligence</span><button type="button" aria-label="Close selected token">×</button></header>
      <div className="tracking-selected-identity"><AssetBadge label={token.symbol} tone={token.tone} /><div><h2>{token.name} {token.symbol}</h2><small>{token.pair} · {token.networks} networks</small></div><b className="tracking-active-pill">● Active</b></div>
      <div className="tracking-hero-stats"><span><small>Reference Price</small><strong>{token.price}</strong><Change value={token.change} /></span><span><small>Last Activity</small><strong className="tracking-activity"><i /> {token.activity}</strong></span></div>
      <div className="tracking-detail-actions"><button className="tracking-primary" type="button">Open Market</button><button type="button">View Contract ↗</button></div>
      <div className="tracking-facts"><span><small>Networks</small><strong>{token.networks}</strong></span><span><small>Pair</small><strong>{token.pair}</strong></span><span><small>Status</small><strong>Watching</strong></span></div>
      <section className="tracking-side-card"><h3>Monitoring Summary</h3><p>This interface is ready to show price moves, holder activity, and alerts after an asset-intelligence provider is connected.</p><div className="tracking-side-list"><span><AssetBadge label="24H" tone="violet" /><b>Price movement<small>Reference change shown in the preview</small></b><Change value={token.change} /></span><span><AssetBadge label="NET" tone="blue" /><b>Network coverage<small>{token.networks} chains represented</small></b><em>Ready</em></span><span><AssetBadge label="AL" tone="teal" /><b>Alert state<small>Prepared for signal notifications</small></b><em>On</em></span></div></section>
      <section className="tracking-side-card"><h3>Recent Activity (24H)</h3><div className="tracking-activity-list"><span><i className="receive">↓</i><b>Large buy detected<small>Preview transaction</small></b><em className="tracking-positive">+{token.symbol}</em></span><span><i className="send">↑</i><b>Exchange transfer<small>Preview transaction</small></b><em className="tracking-negative">-{token.symbol}</em></span></div></section>
    </aside>
  );
}

function WalletIntelligence({ wallet }: { wallet: WalletRow }) {
  return (
    <aside className="tracking-intelligence">
      <header><span>Selected Wallet Intelligence</span><button type="button" aria-label="Close selected wallet">×</button></header>
      <div className="tracking-selected-identity"><AssetBadge label={wallet.short} tone={wallet.tone} /><div><h2>{wallet.name}</h2><small>{wallet.address}</small></div><b className="tracking-active-pill">● Active</b></div>
      <div className="tracking-hero-stats"><span><small>Total Holdings (USD)</small><strong>{wallet.holdings}</strong><Change value={wallet.change} /></span><span><small>Last Activity</small><strong className="tracking-activity"><i /> {wallet.activity}</strong></span></div>
      <div className="tracking-detail-actions"><button className="tracking-primary" type="button">View Intelligence ↗</button><button type="button">Open in Explorer ↗</button></div>
      <div className="tracking-facts"><span><small>First Seen</small><strong>3 years ago</strong></span><span><small>Transactions</small><strong>24,389</strong></span><span><small>Tokens Held</small><strong>1,248</strong></span><span><small>Chains</small><strong>12</strong></span></div>
      <section className="tracking-side-card"><h3>Top Holdings</h3><div className="tracking-holdings"><span><AssetBadge label="ETH" tone="violet" /><b>ETH</b><strong>$982.45M</strong><em>39.3%</em></span><span><AssetBadge label="USDT" tone="teal" /><b>USDT</b><strong>$432.21M</strong><em>17.8%</em></span><span><AssetBadge label="BTC" tone="orange" /><b>BTC</b><strong>$317.88M</strong><em>13.1%</em></span><span><AssetBadge label="BNB" tone="gold" /><b>BNB</b><strong>$216.74M</strong><em>8.9%</em></span><span><AssetBadge label="USDC" tone="blue" /><b>USDC</b><strong>$178.66M</strong><em>7.3%</em></span></div></section>
      <section className="tracking-side-card"><h3>Recent Activity (24H) <button type="button">View all</button></h3><div className="tracking-activity-list"><span><i className="receive">↓</i><b>Received<small>From 0x3f4A...7c2B</small></b><em className="tracking-positive">+1,250 ETH</em></span><span><i className="send">↑</i><b>Sent<small>To 0x71c8...9e72</small></b><em className="tracking-negative">-3,000 USDT</em></span><span><i className="receive">↓</i><b>Received<small>From 0x8b2d...1f44</small></b><em className="tracking-positive">+750 BTC</em></span></div></section>
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
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [selectedWallet, setSelectedWallet] = useState(WALLETS[0]);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshTokens = useCallback(() =>
    fetch("/api/tracked/tokens").then(r => r.ok ? r.json() : []).then(setDbTokens).catch(() => {}), []);
  const refreshWallets = useCallback(() =>
    fetch("/api/wallet-portfolio")
      .then(r => r.ok ? r.json() : { wallets: [], alchemyConfigured: false })
      .then(({ wallets, alchemyConfigured: ac }) => { setPortfolioWallets(wallets); setAlchemyConfigured(ac); })
      .catch(() => {}), []);

  useEffect(() => { refreshTokens(); refreshWallets(); }, [refreshTokens, refreshWallets]);

  const existingSymbols = useMemo(() => new Set(TOKENS.map(t => t.symbol)), []);
  const existingAddresses = useMemo(() => new Set(WALLETS.map(w => w.address)), []);

  const [marketData, setMarketData] = useState<Map<string, MarketEntry>>(new Map());

  useEffect(() => {
    const ids = dbTokens.filter(t => t.coingecko_id).map(t => t.coingecko_id!).join(",");
    if (!ids) return;
    fetch(`/api/coins/market?ids=${encodeURIComponent(ids)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: MarketEntry[]) => setMarketData(new Map(data.map(d => [d.id, d]))))
      .catch(() => {});
  }, [dbTokens]);

  const allTokens = useMemo(() => {
    const dbRows: TokenRow[] = dbTokens.filter(t => !existingSymbols.has(t.symbol)).map(t => {
      const m = t.coingecko_id ? marketData.get(t.coingecko_id) : undefined;
      const rawPrice = m?.priceUsd ?? t.cached_price;
      const price = rawPrice != null
        ? (rawPrice >= 1
          ? `$${rawPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `$${rawPrice.toPrecision(4)}`)
        : "—";
      return {
        symbol: t.symbol,
        name: m?.name || t.full_name || t.label || t.symbol,
        pair: `${t.symbol} / USDT`,
        networks: 1,
        price,
        change: m?.changePercent24Hr ?? t.cached_change_24h ?? 0,
        activity: m ? "Live" : "Just added",
        tone: "violet",
        image: m?.image || t.image_url || undefined,
        coingecko_id: t.coingecko_id || undefined,
        db_id: t.id,
      };
    });
    return [...dbRows, ...TOKENS];
  }, [dbTokens, existingSymbols, marketData]);

  const allWallets = useMemo(() => {
    const portfolioRows: WalletRow[] = portfolioWallets
      .filter(w => !existingAddresses.has(w.address))
      .map(w => {
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
    return [...portfolioRows, ...WALLETS];
  }, [portfolioWallets, existingAddresses]);

  const tokens = useMemo(() => allTokens.filter(t => `${t.name} ${t.symbol} ${t.pair}`.toLowerCase().includes(query.toLowerCase())), [allTokens, query]);
  const wallets = useMemo(() => allWallets.filter(w => `${w.name} ${w.address} ${w.chain}`.toLowerCase().includes(query.toLowerCase())), [allWallets, query]);


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

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const removeToken = useCallback(async (symbol: string) => {
    await fetch(`/api/tracked/tokens/${symbol}`, { method: "DELETE" });
    await refreshTokens();
    setOpenMenu(null);
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
                    <div className={`tracking-table-row ${selectedToken.symbol === token.symbol ? "selected" : ""}`} key={token.symbol} role="row" onClick={() => setSelectedToken(token)}>
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
                    <div className={`tracking-table-row ${selectedWallet.address === wallet.address ? "selected" : ""}`} key={wallet.address} role="row" onClick={() => setSelectedWallet(wallet)}>
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
        {tab === "tokens" ? <TokenIntelligence token={selectedToken} /> : <WalletIntelligence wallet={selectedWallet} />}
      </div>
      {toast && <div className="tracking-toast" role="status">✓ {toast}</div>}
      {dialog && <TrackingDialog kind={dialog} close={() => setDialog(null)} finish={finishDialog} onSave={dialog === "tokens" ? saveToken : saveWallet} />}
    </div>
  );
}
