"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

type Market = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

type ChartCandle = Candle & {
  wickTop: number;
  wickHeight: number;
  bodyTop: number;
  bodyHeight: number;
};

const QUOTE_FILTERS = ["USDT", "USDC", "FDUSD", "BTC", "ETH"];
const CHART_TIMEFRAMES = [
  ["1m", "1m"],
  ["5m", "5m"],
  ["15m", "15m"],
  ["1h", "1H"],
  ["4h", "4H"],
  ["1d", "1D"],
] as const;

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentChange(market: Market) {
  const open = numberValue(market.openPrice);
  const last = numberValue(market.lastPrice);
  return open > 0 ? ((last - open) / open) * 100 : 0;
}

function formatPrice(value: string | number) {
  const price = typeof value === "number" ? value : numberValue(value);
  if (price === 0) return "—";
  const maximumFractionDigits = price >= 1000 ? 2 : price >= 1 ? 4 : price >= .01 ? 6 : 9;
  return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits });
}

function formatVolume(value: string) {
  const volume = numberValue(value);
  if (volume === 0) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(volume);
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MarketChart({ candles }: { candles: Candle[] }) {
  const chart = useMemo(() => {
    if (candles.length === 0) return null;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const candle of candles) {
      if (candle.low < minimum) minimum = candle.low;
      if (candle.high > maximum) maximum = candle.high;
    }
    const rawRange = maximum - minimum;
    const padding = rawRange > 0 ? rawRange * .08 : Math.max(maximum * .01, .000001);
    const low = minimum - padding;
    const high = maximum + padding;
    const range = high - low;
    const position = (price: number) => ((high - price) / range) * 100;
    const plotted: ChartCandle[] = candles.map((candle) => {
      const wickTop = position(candle.high);
      const wickBottom = position(candle.low);
      const bodyTop = position(Math.max(candle.open, candle.close));
      const bodyBottom = position(Math.min(candle.open, candle.close));
      return {
        ...candle,
        wickTop,
        wickHeight: Math.max(.35, wickBottom - wickTop),
        bodyTop,
        bodyHeight: Math.max(.8, bodyBottom - bodyTop),
      };
    });
    return {
      low,
      high,
      labels: [high, high - range / 3, high - range * 2 / 3, low],
      plotted,
    };
  }, [candles]);

  if (!chart) return null;
  const first = candles[0];
  const middle = candles[Math.floor(candles.length / 2)];
  const last = candles[candles.length - 1];

  return (
    <div className="market-chart-plot" aria-label="Candlestick price chart">
      <div className="market-chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="market-price-axis" aria-hidden="true">
        {chart.labels.map((label) => <span key={label}>{formatPrice(label)}</span>)}
      </div>
      <div className="market-candle-layer" aria-hidden="true">
        {chart.plotted.map((candle) => {
          const rising = candle.close >= candle.open;
          return (
            <span className={`market-candle-slot ${rising ? "rising" : "falling"}`} key={candle.time}>
              <i style={{ top: `${candle.wickTop}%`, height: `${candle.wickHeight}%` }} />
              <b style={{ top: `${candle.bodyTop}%`, height: `${candle.bodyHeight}%` }} />
            </span>
          );
        })}
      </div>
      <div className="market-time-axis" aria-hidden="true"><span>{formatTime(first.time)}</span><span>{formatTime(middle.time)}</span><span>{formatTime(last.time)}</span></div>
    </div>
  );
}

export default function MarketsView() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<Market | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quoteFilter, setQuoteFilter] = useState("USDT");
  const [query, setQuery] = useState("");
  const [interval, setInterval] = useState("15m");
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [marketsError, setMarketsError] = useState("");
  const [chartError, setChartError] = useState("");
  const [marketRequest, setMarketRequest] = useState(0);
  const [chartRequest, setChartRequest] = useState(0);
  const [asOf, setAsOf] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toUpperCase());

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarkets() {
      setMarketsLoading(true);
      setMarketsError("");
      try {
        const response = await fetch("/api/markets", { signal: controller.signal });
        const payload = await response.json() as { markets?: Market[]; asOf?: number; error?: string };
        if (!response.ok || !payload.markets) throw new Error(payload.error ?? "Unable to load exchange markets.");
        setMarkets(payload.markets);
        setAsOf(payload.asOf ?? Date.now());
      } catch (error) {
        if (controller.signal.aborted) return;
        setMarketsError(error instanceof Error ? error.message : "Unable to load exchange markets.");
      } finally {
        if (!controller.signal.aborted) setMarketsLoading(false);
      }
    }
    void loadMarkets();
    return () => controller.abort();
  }, [marketRequest]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    async function loadChart() {
      setChartLoading(true);
      setChartError("");
      try {
        const params = new URLSearchParams({ symbol: selected.symbol, interval });
        const response = await fetch(`/api/markets/candles?${params}`, { signal: controller.signal });
        const payload = await response.json() as { candles?: Candle[]; error?: string };
        if (!response.ok || !payload.candles) throw new Error(payload.error ?? "Unable to load this chart.");
        setCandles(payload.candles);
      } catch (error) {
        if (controller.signal.aborted) return;
        setChartError(error instanceof Error ? error.message : "Unable to load this chart.");
        setCandles([]);
      } finally {
        if (!controller.signal.aborted) setChartLoading(false);
      }
    }
    void loadChart();
    return () => controller.abort();
  }, [selected, interval, chartRequest]);

  const filteredMarkets = useMemo(() => {
    const result = markets.filter((market) => {
      const matchesQuote = quoteFilter === "ALL" || market.quoteAsset === quoteFilter;
      const matchesQuery = !deferredQuery || market.symbol.includes(deferredQuery) || market.baseAsset.includes(deferredQuery) || market.quoteAsset.includes(deferredQuery);
      return matchesQuote && matchesQuery;
    });
    return result.toSorted((left, right) => numberValue(right.quoteVolume) - numberValue(left.quoteVolume));
  }, [markets, quoteFilter, deferredQuery]);

  const selectedChange = selected ? percentChange(selected) : 0;

  return (
    <div className="screen inner-screen markets-screen">
      <header className="markets-header">
        <div className="inner-title">
          <span className="markets-hero-icon" aria-hidden="true">◉</span>
          <div><h1>Markets</h1><p>Browse Binance.US Spot pairs and load any chart on demand.</p></div>
        </div>
        <div className="markets-connection"><span><i aria-hidden="true" /> Binance.US connected</span><small>Public read-only market data</small></div>
      </header>

      <main className="markets-layout">
        <aside className="surface market-browser-panel">
          <header><div><h2>Exchange Markets</h2><p>{marketsLoading ? "Loading trading pairs…" : `${filteredMarkets.length.toLocaleString()} pairs shown`}</p></div><button type="button" disabled={marketsLoading} onClick={() => setMarketRequest((current) => current + 1)} aria-label="Refresh market prices">↻</button></header>
          <label className="market-search"><span aria-hidden="true">⌕</span><input type="search" value={query} placeholder="Search BTC, SOL, USDT…" aria-label="Search exchange markets" onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="market-quote-filters" aria-label="Filter by quote asset">
            <button className={quoteFilter === "ALL" ? "active" : ""} type="button" aria-pressed={quoteFilter === "ALL"} onClick={() => setQuoteFilter("ALL")}>All</button>
            {QUOTE_FILTERS.map((quote) => <button className={quoteFilter === quote ? "active" : ""} type="button" aria-pressed={quoteFilter === quote} onClick={() => setQuoteFilter(quote)} key={quote}>{quote}</button>)}
          </div>
          <div className="market-list-heading"><span>Pair</span><span>Price</span><span>24h</span></div>
          <div className="market-list" aria-live="polite">
            {marketsLoading ? <div className="market-list-message"><span className="market-loader" />Connecting to Binance.US…</div> : null}
            {!marketsLoading && marketsError ? <div className="market-list-message error"><strong>Market list unavailable</strong><span>{marketsError}</span><button type="button" onClick={() => setMarketRequest((current) => current + 1)}>Try again</button></div> : null}
            {!marketsLoading && !marketsError && filteredMarkets.length === 0 ? <div className="market-list-message">No trading pairs match these filters.</div> : null}
            {!marketsLoading && !marketsError ? filteredMarkets.map((market) => {
              const change = percentChange(market);
              return (
                <button className={selected?.symbol === market.symbol ? "active" : ""} type="button" aria-pressed={selected?.symbol === market.symbol} onClick={() => setSelected(market)} key={market.symbol}>
                  <span className="market-pair"><i aria-hidden="true">{market.baseAsset.slice(0, 2)}</i><span><strong>{market.baseAsset}</strong><small>/{market.quoteAsset}</small></span></span>
                  <span className="market-row-price"><strong>{formatPrice(market.lastPrice)}</strong><small>{formatVolume(market.quoteVolume)} {market.quoteAsset}</small></span>
                  <b className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</b>
                </button>
              );
            }) : null}
          </div>
          <footer><span>{asOf ? `Prices refreshed ${formatTime(asOf)}` : "Waiting for exchange"}</span><b>Read only</b></footer>
        </aside>

        <section className="surface market-chart-panel">
          {!selected ? (
            <div className="market-chart-empty"><span aria-hidden="true">⌁</span><h2>Choose a coin to load its chart</h2><p>Select any trading pair from the Binance.US list. Candle data is not downloaded until you make a selection.</p></div>
          ) : (
            <>
              <header className="market-chart-header">
                <div className="market-selected-pair"><i aria-hidden="true">{selected.baseAsset.slice(0, 2)}</i><span><h2>{selected.baseAsset}<small> / {selected.quoteAsset}</small></h2><p>Binance.US Spot · {selected.symbol}</p></span></div>
                <div className="market-last-price"><small>Last price</small><strong>{formatPrice(selected.lastPrice)}</strong><b className={selectedChange >= 0 ? "positive" : "negative"}>{selectedChange >= 0 ? "+" : ""}{selectedChange.toFixed(2)}%</b></div>
              </header>
              <div className="market-chart-toolbar">
                <div className="market-timeframes" aria-label="Chart timeframe">
                  {CHART_TIMEFRAMES.map(([value, label]) => <button className={interval === value ? "active" : ""} type="button" aria-pressed={interval === value} onClick={() => setInterval(value)} key={value}>{label}</button>)}
                </div>
                <button className="market-chart-refresh" type="button" disabled={chartLoading} onClick={() => setChartRequest((current) => current + 1)}>↻ Refresh chart</button>
              </div>
              <div className="market-chart-frame">
                {chartLoading ? <div className="market-chart-loading"><span className="market-loader" />Loading {selected.symbol} candles…</div> : null}
                {!chartLoading && chartError ? <div className="market-chart-loading error"><strong>Chart unavailable</strong><span>{chartError}</span><button type="button" onClick={() => setChartRequest((current) => current + 1)}>Try again</button></div> : null}
                {!chartLoading && !chartError ? <MarketChart candles={candles} /> : null}
              </div>
              <div className="market-stat-grid">
                <span><small>24h high</small><strong>{formatPrice(selected.highPrice)}</strong></span>
                <span><small>24h low</small><strong>{formatPrice(selected.lowPrice)}</strong></span>
                <span><small>24h volume</small><strong>{formatVolume(selected.quoteVolume)} {selected.quoteAsset}</strong></span>
                <span><small>Chart candles</small><strong>{candles.length || "—"}</strong></span>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
