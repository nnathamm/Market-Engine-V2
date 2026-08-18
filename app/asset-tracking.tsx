"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DbToken = { id: number; symbol: string; label: string | null; created_at: string };
type DbWallet = { id: number; address: string; label: string | null; chain: string | null; notes: string | null; created_at: string };

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

function TrackingDialog({ kind, close, finish, onSave }: {
  kind: Exclude<DialogKind, null>;
  close: () => void;
  finish: (message: string) => void;
  onSave?: (data: Record<string, string>) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
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

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (kind === "tokens") {
        const symbol = search.trim().toUpperCase();
        if (symbol && onSave) await onSave({ symbol, label });
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

  return (
    <div className="tracking-modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && close()}>
      <form className="tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-dialog-title" onSubmit={submit}>
        <header>
          <div><span className="tracking-dialog-mark" aria-hidden="true">◎</span><h2 id="tracking-dialog-title">Add New {kind === "tokens" ? "Token" : "Wallet"}</h2></div>
          <button type="button" aria-label="Close dialog" onClick={close}>×</button>
        </header>
        <p>{kind === "tokens" ? "Add a token or trading pair to your monitored assets." : "Add a wallet address to your monitored assets."}</p>

        {kind === "tokens" ? (
          <>
            <label className="tracking-dialog-field">
              <span>Search Token or Paste Contract</span>
              <div className="tracking-input-with-icon"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by token name, symbol, or contract address..." /><i aria-hidden="true">⌕</i></div>
              <small>Supports a token name, symbol, or contract address.</small>
            </label>
            <button className="tracking-token-result" type="button">
              <AssetBadge label="PEPE" tone="green" />
              <span><strong>PEPE <b>✓</b></strong><small>Pepe</small></span>
              <span><small>6 networks detected</small><em>◆ ◉ ◇ ⬡ ＋1</em></span>
            </button>
            <p className="tracking-result-note">This preview represents cross-network monitoring; no provider is connected yet.</p>
            <label className="tracking-dialog-field"><span>Label (Optional)</span><input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. PEPE Meme Coin" /><small>Give this token a name to easily identify it.</small></label>
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
  const [dbWallets, setDbWallets] = useState<DbWallet[]>([]);
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [selectedWallet, setSelectedWallet] = useState(WALLETS[0]);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshTokens = useCallback(() =>
    fetch("/api/tracked/tokens").then(r => r.ok ? r.json() : []).then(setDbTokens).catch(() => {}), []);
  const refreshWallets = useCallback(() =>
    fetch("/api/tracked/wallets").then(r => r.ok ? r.json() : []).then(setDbWallets).catch(() => {}), []);

  useEffect(() => { refreshTokens(); refreshWallets(); }, [refreshTokens, refreshWallets]);

  const existingSymbols = useMemo(() => new Set(TOKENS.map(t => t.symbol)), []);
  const existingAddresses = useMemo(() => new Set(WALLETS.map(w => w.address)), []);

  const allTokens = useMemo(() => {
    const dbRows: TokenRow[] = dbTokens.filter(t => !existingSymbols.has(t.symbol)).map(t => ({
      symbol: t.symbol, name: t.label || t.symbol, pair: `${t.symbol} / USDT`,
      networks: 1, price: "—", change: 0, activity: "Just added", tone: "violet",
    }));
    return [...dbRows, ...TOKENS];
  }, [dbTokens, existingSymbols]);

  const allWallets = useMemo(() => {
    const dbRows: WalletRow[] = dbWallets.filter(w => !existingAddresses.has(w.address)).map(w => ({
      short: (w.label || w.address).slice(0, 2).toUpperCase(),
      name: w.label || `Wallet ${w.address.slice(0, 6)}…`,
      address: w.address, chain: w.chain || "Unknown",
      holdings: "—", change: 0, activity: "Just added", tone: "gray",
    }));
    return [...dbRows, ...WALLETS];
  }, [dbWallets, existingAddresses]);

  const tokens = useMemo(() => allTokens.filter(t => `${t.name} ${t.symbol} ${t.pair}`.toLowerCase().includes(query.toLowerCase())), [allTokens, query]);
  const wallets = useMemo(() => allWallets.filter(w => `${w.name} ${w.address} ${w.chain}`.toLowerCase().includes(query.toLowerCase())), [allWallets, query]);

  const saveToken = useCallback(async (data: Record<string, string>) => {
    await fetch("/api/tracked/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    await refreshTokens();
  }, [refreshTokens]);

  const saveWallet = useCallback(async (data: Record<string, string>) => {
    await fetch("/api/tracked/wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    await refreshWallets();
  }, [refreshWallets]);

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
                {tokens.map((token) => <button className={`tracking-table-row ${selectedToken.symbol === token.symbol ? "selected" : ""}`} type="button" key={token.symbol} onClick={() => setSelectedToken(token)}><span className="tracking-name-cell"><AssetBadge label={token.symbol} tone={token.tone} /><b>{token.name}<small>{token.pair}</small></b></span><span>{token.networks} networks</span><strong>{token.price}</strong><Change value={token.change} /><span className="tracking-activity"><i />{token.activity}</span><span className="tracking-row-actions">◉ ↗ •••</span></button>)}
                {!tokens.length && <div className="tracking-empty">No watched tokens match that search.</div>}
              </div>
            ) : (
              <div className="tracking-table wallet-table">
                <div className="tracking-table-head"><span>Wallet / Label</span><span>Chain</span><span>Holdings (USD)</span><span>24H Change</span><span>Last Activity</span><span>Actions</span></div>
                {wallets.map((wallet) => <button className={`tracking-table-row ${selectedWallet.address === wallet.address ? "selected" : ""}`} type="button" key={wallet.address} onClick={() => setSelectedWallet(wallet)}><span className="tracking-name-cell"><AssetBadge label={wallet.short} tone={wallet.tone} /><b>{wallet.name}<small>{wallet.address}</small></b></span><span className="tracking-chain">◆ {wallet.chain}</span><strong>{wallet.holdings}</strong><Change value={wallet.change} /><span className="tracking-activity"><i />{wallet.activity}</span><span className="tracking-row-actions">◉ ↗ •••</span></button>)}
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
