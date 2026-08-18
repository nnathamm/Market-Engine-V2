"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type UTCTimestamp,
} from "lightweight-charts";

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

type BinanceSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
};

type BinanceTicker = {
  symbol: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
};

type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

const BINANCE_MARKET_DATA = "https://data-api.binance.vision";
const MARKET_PAGE_SIZE = 20;
const KLINE_PAGE_SIZE = 500;
const FAVORITES_STORAGE_KEY = "edge-signals-market-favorites-v1";
const FAVORITES_CHANGED_EVENT = "edge-signals-market-favorites-changed";
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

function subscribeFavorites(notify: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_STORAGE_KEY) notify();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(FAVORITES_CHANGED_EVENT, notify);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(FAVORITES_CHANGED_EVENT, notify);
  };
}

function getFavoritesSnapshot() {
  return localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]";
}

function getServerFavoritesSnapshot() {
  return "[]";
}

function parseFavorites(snapshot: string) {
  try {
    const saved = JSON.parse(snapshot) as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((symbol): symbol is string => typeof symbol === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function chartPrecision(price: number) {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= .01) return 6;
  return 9;
}

function MarketChart({
  candles,
  datasetKey,
  historyLoading,
  hasMoreHistory,
  onNeedMore,
}: {
  candles: Candle[];
  datasetKey: string;
  historyLoading: boolean;
  hasMoreHistory: boolean;
  onNeedMore: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const datasetKeyRef = useRef("");
  const previousLengthRef = useRef(0);
  const onNeedMoreRef = useRef(onNeedMore);

  useEffect(() => {
    onNeedMoreRef.current = onNeedMore;
  }, [onNeedMore]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      height: 398,
      layout: {
        background: { type: ColorType.Solid, color: "#071321" },
        textColor: "#718096",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#142235" },
        horzLines: { color: "#1b2a3d" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#8052a7", labelBackgroundColor: "#6f3e96" },
        horzLine: { color: "#8052a7", labelBackgroundColor: "#6f3e96" },
      },
      rightPriceScale: {
        borderColor: "#243247",
        scaleMargins: { top: .1, bottom: .12 },
      },
      timeScale: {
        borderColor: "#243247",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#44dca6",
      downColor: "#f45f73",
      wickUpColor: "#44dca6",
      wickDownColor: "#f45f73",
      borderVisible: false,
      priceLineColor: "#9d58d7",
    });
    const handleVisibleRange = (range: { from: Logical; to: Logical } | null) => {
      if (!range) return;
      const bars = series.barsInLogicalRange(range);
      if (bars && bars.barsBefore < 50) onNeedMoreRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;
    const data: CandlestickData<UTCTimestamp>[] = candles.map((candle) => ({
      time: Math.floor(candle.time / 1000) as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    const precision = chartPrecision(candles[candles.length - 1].close);
    series.applyOptions({
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });

    const previousRange = chart.timeScale().getVisibleLogicalRange();
    const sameDataset = datasetKeyRef.current === datasetKey;
    const insertedBars = sameDataset ? Math.max(0, data.length - previousLengthRef.current) : 0;
    series.setData(data);

    if (!sameDataset) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - 90) as Logical,
        to: (data.length + 4) as Logical,
      });
    } else if (previousRange && insertedBars > 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: (previousRange.from + insertedBars) as Logical,
        to: (previousRange.to + insertedBars) as Logical,
      });
    }

    datasetKeyRef.current = datasetKey;
    previousLengthRef.current = data.length;
  }, [candles, datasetKey]);

  function zoom(multiplier: number) {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !range) return;
    const midpoint = (range.from + range.to) / 2;
    const halfSpan = Math.max(3, ((range.to - range.from) / 2) * multiplier);
    timeScale.setVisibleLogicalRange({
      from: (midpoint - halfSpan) as Logical,
      to: (midpoint + halfSpan) as Logical,
    });
  }

  function showLatest() {
    const timeScale = chartRef.current?.timeScale();
    if (!timeScale || candles.length === 0) return;
    timeScale.setVisibleLogicalRange({
      from: Math.max(0, candles.length - 90) as Logical,
      to: (candles.length + 4) as Logical,
    });
  }

  return (
    <div className="market-chart-plot" aria-label="Interactive candlestick price chart">
      <div ref={containerRef} className="market-chart-canvas" />
      <div className="market-chart-controls" aria-label="Chart controls">
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(.7)}>＋</button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.4)}>−</button>
        <button type="button" className="latest" onClick={showLatest}>Latest</button>
      </div>
      <div className="market-chart-help">Scroll or pinch to zoom · Drag to move · Older candles load at the left</div>
      {historyLoading ? <div className="market-history-status"><span className="market-loader" /> Loading older candles…</div> : null}
      {!hasMoreHistory ? <div className="market-history-status complete">Start of available history</div> : null}
    </div>
  );
}

export default function MarketsView() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<Market | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quoteFilter, setQuoteFilter] = useState("ALL");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MARKET_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [interval, setInterval] = useState("15m");
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [marketsError, setMarketsError] = useState("");
  const [chartError, setChartError] = useState("");
  const [marketRequest, setMarketRequest] = useState(0);
  const [chartRequest, setChartRequest] = useState(0);
  const [asOf, setAsOf] = useState(0);
  const candlesRef = useRef<Candle[]>([]);
  const historyLoadingRef = useRef(false);
  const datasetKey = selected ? `${selected.symbol}:${interval}` : "";
  const datasetKeyRef = useRef(datasetKey);
  const deferredQuery = useDeferredValue(query.trim().toUpperCase());
  const favoritesSnapshot = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getServerFavoritesSnapshot);
  const favorites = useMemo(() => parseFavorites(favoritesSnapshot), [favoritesSnapshot]);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    datasetKeyRef.current = datasetKey;
  }, [datasetKey]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarkets() {
      setMarketsLoading(true);
      setMarketsError("");
      try {
        const [exchangeResponse, tickerResponse] = await Promise.all([
          fetch(`${BINANCE_MARKET_DATA}/api/v3/exchangeInfo`, { signal: controller.signal }),
          fetch(`${BINANCE_MARKET_DATA}/api/v3/ticker/24hr?type=MINI`, { signal: controller.signal }),
        ]);
        if (!exchangeResponse.ok || !tickerResponse.ok) throw new Error("Unable to load Binance markets.");
        const [exchange, tickers] = await Promise.all([
          exchangeResponse.json() as Promise<{ symbols?: BinanceSymbol[] }>,
          tickerResponse.json() as Promise<BinanceTicker[]>,
        ]);
        const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
        const nextMarkets = (exchange.symbols ?? [])
          .filter((market) => market.status === "TRADING" && market.isSpotTradingAllowed !== false)
          .map((market): Market => {
            const ticker = tickerBySymbol.get(market.symbol);
            return {
              symbol: market.symbol,
              baseAsset: market.baseAsset,
              quoteAsset: market.quoteAsset,
              status: market.status,
              lastPrice: ticker?.lastPrice ?? "0",
              openPrice: ticker?.openPrice ?? "0",
              highPrice: ticker?.highPrice ?? "0",
              lowPrice: ticker?.lowPrice ?? "0",
              volume: ticker?.volume ?? "0",
              quoteVolume: ticker?.quoteVolume ?? "0",
              closeTime: ticker?.closeTime ?? Date.now(),
            };
          });
        setMarkets(nextMarkets);
        setAsOf(Date.now());
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
    historyLoadingRef.current = false;
    async function loadChart() {
      setHistoryLoading(false);
      setHasMoreHistory(true);
      setChartLoading(true);
      setChartError("");
      try {
        const params = new URLSearchParams({ symbol: selected.symbol, interval, limit: String(KLINE_PAGE_SIZE) });
        const response = await fetch(`${BINANCE_MARKET_DATA}/api/v3/klines?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load this Binance chart.");
        const rows = await response.json() as BinanceKline[];
        const nextCandles = rows.map((row) => ({
          time: row[0],
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5]),
          closeTime: row[6],
        }));
        candlesRef.current = nextCandles;
        setCandles(nextCandles);
        setHasMoreHistory(rows.length === KLINE_PAGE_SIZE);
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

  const loadOlderCandles = useCallback(async () => {
    const currentCandles = candlesRef.current;
    if (!selected || currentCandles.length === 0 || historyLoadingRef.current || !hasMoreHistory) return;
    const requestKey = `${selected.symbol}:${interval}`;
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        symbol: selected.symbol,
        interval,
        endTime: String(currentCandles[0].time - 1),
        limit: String(KLINE_PAGE_SIZE),
      });
      const response = await fetch(`${BINANCE_MARKET_DATA}/api/v3/klines?${params}`);
      if (!response.ok) throw new Error("Unable to load older Binance candles.");
      const rows = await response.json() as BinanceKline[];
      if (datasetKeyRef.current !== requestKey) return;
      const olderCandles = rows.map((row) => ({
        time: row[0],
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: row[6],
      })).filter((candle) => candle.time < currentCandles[0].time);
      const nextCandles = [...olderCandles, ...currentCandles];
      candlesRef.current = nextCandles;
      setCandles(nextCandles);
      setHasMoreHistory(rows.length === KLINE_PAGE_SIZE && olderCandles.length > 0);
    } catch (error) {
      if (datasetKeyRef.current === requestKey) {
        setChartError(error instanceof Error ? error.message : "Unable to load older candles.");
      }
    } finally {
      historyLoadingRef.current = false;
      if (datasetKeyRef.current === requestKey) setHistoryLoading(false);
    }
  }, [selected, interval, hasMoreHistory]);

  const filteredMarkets = useMemo(() => {
    const result = markets.filter((market) => {
      const matchesQuote = quoteFilter === "ALL" || market.quoteAsset === quoteFilter;
      const matchesQuery = !deferredQuery || market.symbol.includes(deferredQuery) || market.baseAsset.includes(deferredQuery) || market.quoteAsset.includes(deferredQuery);
      const matchesFavorite = !favoritesOnly || favorites.has(market.symbol);
      return matchesQuote && matchesQuery && matchesFavorite;
    });
    return result.toSorted((left, right) => numberValue(right.quoteVolume) - numberValue(left.quoteVolume));
  }, [markets, quoteFilter, deferredQuery, favoritesOnly, favorites]);

  const visibleMarkets = filteredMarkets.slice(0, visibleCount);

  function updateQuoteFilter(value: string) {
    setQuoteFilter(value);
    setVisibleCount(MARKET_PAGE_SIZE);
  }

  function updateSearch(value: string) {
    setQuery(value);
    setVisibleCount(MARKET_PAGE_SIZE);
  }

  function toggleFavoritesOnly() {
    setFavoritesOnly((current) => !current);
    setVisibleCount(MARKET_PAGE_SIZE);
  }

  function toggleFavorite(symbol: string) {
    const next = new Set(favorites);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
  }

  function loadMoreOnScroll(event: React.UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
    if (nearBottom && visibleCount < filteredMarkets.length) {
      setVisibleCount((current) => Math.min(current + MARKET_PAGE_SIZE, filteredMarkets.length));
    }
  }

  const selectedChange = selected ? percentChange(selected) : 0;

  return (
    <div className="screen inner-screen markets-screen">
      <header className="markets-header">
        <div className="inner-title">
          <span className="markets-hero-icon" aria-hidden="true">◉</span>
          <div><h1>Markets</h1><p>Browse Binance Spot pairs and load any chart on demand.</p></div>
        </div>
        <div className="markets-connection"><span><i aria-hidden="true" /> Binance Spot connected</span><small>Public read-only market data</small></div>
      </header>

      <main className="markets-layout">
        <aside className="surface market-browser-panel">
          <header><div><h2>Exchange Markets</h2><p>{marketsLoading ? "Loading trading pairs…" : `${visibleMarkets.length.toLocaleString()} of ${filteredMarkets.length.toLocaleString()} pairs loaded`}</p></div><button type="button" disabled={marketsLoading} onClick={() => setMarketRequest((current) => current + 1)} aria-label="Refresh market prices">↻</button></header>
          <label className="market-search"><span aria-hidden="true">⌕</span><input type="search" value={query} placeholder="Search BTC, SOL, USDT…" aria-label="Search exchange markets" onChange={(event) => updateSearch(event.target.value)} /></label>
          <div className="market-browser-filters">
            <div className="market-quote-filters" aria-label="Filter by quote asset">
              <button className={quoteFilter === "ALL" ? "active" : ""} type="button" aria-pressed={quoteFilter === "ALL"} onClick={() => updateQuoteFilter("ALL")}>All</button>
              {QUOTE_FILTERS.map((quote) => <button className={quoteFilter === quote ? "active" : ""} type="button" aria-pressed={quoteFilter === quote} onClick={() => updateQuoteFilter(quote)} key={quote}>{quote}</button>)}
            </div>
            <button className={`market-favorites-filter ${favoritesOnly ? "active" : ""}`} type="button" aria-pressed={favoritesOnly} onClick={toggleFavoritesOnly}><span aria-hidden="true">★</span> Favorites <b>{favorites.size}</b></button>
          </div>
          <div className="market-list-heading"><span>Pair</span><span>Price</span><span>24h</span><span aria-label="Favorite">★</span></div>
          <div className="market-list" aria-live="polite" onScroll={loadMoreOnScroll}>
            {marketsLoading ? <div className="market-list-message"><span className="market-loader" />Connecting to Binance…</div> : null}
            {!marketsLoading && marketsError ? <div className="market-list-message error"><strong>Market list unavailable</strong><span>{marketsError}</span><button type="button" onClick={() => setMarketRequest((current) => current + 1)}>Try again</button></div> : null}
            {!marketsLoading && !marketsError && filteredMarkets.length === 0 ? <div className="market-list-message">{favoritesOnly ? "No favorites match these filters yet." : "No trading pairs match these filters."}</div> : null}
            {!marketsLoading && !marketsError ? visibleMarkets.map((market) => {
              const change = percentChange(market);
              const favorite = favorites.has(market.symbol);
              return (
                <div className={`market-list-row ${selected?.symbol === market.symbol ? "active" : ""}`} key={market.symbol}>
                  <button className="market-row-select" type="button" aria-pressed={selected?.symbol === market.symbol} onClick={() => setSelected(market)}>
                    <span className="market-pair"><i aria-hidden="true">{market.baseAsset.slice(0, 2)}</i><span><strong>{market.baseAsset}</strong><small>/{market.quoteAsset}</small></span></span>
                    <span className="market-row-price"><strong>{formatPrice(market.lastPrice)}</strong><small>{formatVolume(market.quoteVolume)} {market.quoteAsset}</small></span>
                    <b className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</b>
                  </button>
                  <button className={`market-favorite-toggle ${favorite ? "active" : ""}`} type="button" aria-pressed={favorite} aria-label={`${favorite ? "Remove" : "Add"} ${market.symbol} ${favorite ? "from" : "to"} favorites`} onClick={() => toggleFavorite(market.symbol)}>★</button>
                </div>
              );
            }) : null}
            {!marketsLoading && !marketsError && visibleMarkets.length < filteredMarkets.length ? <div className="market-list-progress"><span>Scroll for the next {Math.min(MARKET_PAGE_SIZE, filteredMarkets.length - visibleMarkets.length)} pairs</span><b>{visibleMarkets.length} / {filteredMarkets.length}</b></div> : null}
          </div>
          <footer><span>{asOf ? `Prices refreshed ${formatTime(asOf)}` : "Waiting for exchange"}</span><b>Read only</b></footer>
        </aside>

        <section className="surface market-chart-panel">
          {!selected ? (
            <div className="market-chart-empty"><span aria-hidden="true">⌁</span><h2>Choose a coin to load its chart</h2><p>Select any trading pair from the Binance list. Candle data is not downloaded until you make a selection.</p></div>
          ) : (
            <>
              <header className="market-chart-header">
                <div className="market-selected-pair"><i aria-hidden="true">{selected.baseAsset.slice(0, 2)}</i><span><h2>{selected.baseAsset}<small> / {selected.quoteAsset}</small></h2><p>Binance Spot · {selected.symbol}</p></span></div>
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
                {!chartLoading && !chartError ? <MarketChart candles={candles} datasetKey={datasetKey} historyLoading={historyLoading} hasMoreHistory={hasMoreHistory} onNeedMore={loadOlderCandles} /> : null}
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
