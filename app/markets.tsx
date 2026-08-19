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
import {
  isMarketInterval,
  type MarketInterval,
  type MarketNavigationRequest,
} from "@/lib/market-navigation";

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
  changePercent: number;
  markPrice: string;
  indexPrice: string;
  pricePrecision: number | null;
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

type WeexKline = [number, string, string, string, string, string, number, ...unknown[]];

const MARKET_PAGE_SIZE = 20;
const LIVE_CHART_POLL_MS = 5_000;
const HISTORY_CONFIG: Record<string, { initial: number; visible: number; page: number }> = {
  "1m": { initial: 360, visible: 100, page: 100 },
  "5m": { initial: 360, visible: 110, page: 100 },
  "15m": { initial: 288, visible: 110, page: 100 },
  "1h": { initial: 216, visible: 100, page: 100 },
  "4h": { initial: 150, visible: 80, page: 100 },
  "1d": { initial: 93, visible: 55, page: 93 },
};
const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
const WICK_LIMIT: Record<string, number> = {
  "1m": .08,
  "5m": .10,
  "15m": .14,
  "1h": .22,
  "4h": .35,
  "1d": .55,
};
const FAVORITES_STORAGE_KEY = "edge-signals-market-favorites-v1";
const FAVORITES_CHANGED_EVENT = "edge-signals-market-favorites-changed";

const TRACKED_STORAGE_KEY = "signal-control:tracked-tokens";
const TRACKED_CHANGED_EVENT = "signal-control:tracked-tokens-changed";
const MARKET_INTERVAL_STORAGE_KEY = "signal-control:market-chart-interval";
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
  return Number.isFinite(market.changePercent) ? market.changePercent : 0;
}

function formatPrice(value: string | number, exchangePrecision?: number | null) {
  const price = typeof value === "number" ? value : numberValue(value);
  if (price === 0) return "—";
  const automaticPrecision = price >= 1000 ? 2 : price >= 1 ? 4 : price >= .01 ? 6 : 9;
  const maximumFractionDigits = Number.isInteger(exchangePrecision)
    ? Math.max(0, Math.min(12, Number(exchangePrecision)))
    : automaticPrecision;
  return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits });
}

function formatVolume(value: string) {
  const volume = numberValue(value);
  if (volume === 0) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(volume);
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

function subscribeTracked(notify: () => void) {
  const handleStorage = (event: StorageEvent) => { if (event.key === TRACKED_STORAGE_KEY) notify(); };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(TRACKED_CHANGED_EVENT, notify);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(TRACKED_CHANGED_EVENT, notify);
  };
}

function getTrackedSnapshot() {
  return localStorage.getItem(TRACKED_STORAGE_KEY) ?? "[]";
}

function getServerTrackedSnapshot() {
  return "[]";
}

function parseTracked(snapshot: string) {
  try {
    const saved = JSON.parse(snapshot) as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function cleanCandle(row: WeexKline, interval: string): Candle | null {
  const time = Number(row?.[0]);
  const open = Number(row?.[1]);
  const high = Number(row?.[2]);
  const low = Number(row?.[3]);
  const close = Number(row?.[4]);
  const volume = Math.max(0, Number(row?.[5]) || 0);
  const closeTime = Number(row?.[6]) || time + (INTERVAL_MS[interval] ?? 60_000) - 1;
  if (![time, open, high, low, close].every(Number.isFinite) || time <= 0 || Math.min(open, high, low, close) <= 0) return null;
  if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) return null;
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);
  const wickLimit = WICK_LIMIT[interval] ?? .35;
  const upperWick = (high - bodyHigh) / Math.max(bodyHigh, 1e-12);
  const lowerWick = (bodyLow - low) / Math.max(bodyLow, 1e-12);
  if (upperWick > wickLimit || lowerWick > wickLimit) return null;
  const bucket = INTERVAL_MS[interval] ?? 60_000;
  if (time % bucket !== 0) return null;
  return { time, open, high, low, close, volume, closeTime };
}

function sanitizeRows(rows: WeexKline[], interval: string) {
  const unique = new Map<number, Candle>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const candle = cleanCandle(row, interval);
    if (candle) unique.set(candle.time, candle);
  }
  return [...unique.values()].toSorted((left, right) => left.time - right.time);
}

function mergeCandles(current: Candle[], incoming: Candle[]) {
  const merged = new Map(current.map((candle) => [candle.time, candle]));
  for (const candle of incoming) merged.set(candle.time, candle);
  return [...merged.values()].toSorted((left, right) => left.time - right.time);
}

function MarketChart({
  candles,
  datasetKey,
  historyLoading,
  hasMoreHistory,
  onNeedMore,
  visibleCandles,
}: {
  candles: Candle[];
  datasetKey: string;
  historyLoading: boolean;
  hasMoreHistory: boolean;
  onNeedMore: () => void;
  visibleCandles: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const datasetKeyRef = useRef("");
  const dataLengthRef = useRef(0);
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
        background: { type: ColorType.Solid, color: "#0a0f16" },
        textColor: "#8493a5",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#151e29" },
        horzLines: { color: "#151e29" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#516174", labelBackgroundColor: "#263545" },
        horzLine: { color: "#516174", labelBackgroundColor: "#263545" },
      },
      rightPriceScale: {
        borderColor: "#263545",
        scaleMargins: { top: .08, bottom: .08 },
      },
      timeScale: {
        borderColor: "#344253",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 8,
        minBarSpacing: 2,
        lockVisibleTimeRangeOnResize: true,
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
      upColor: "#19c37d",
      downColor: "#f04452",
      borderUpColor: "#19c37d",
      borderDownColor: "#f04452",
      wickUpColor: "#19c37d",
      wickDownColor: "#f04452",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const handleVisibleRange = (range: { from: Logical; to: Logical } | null) => {
      if (!range) return;
      if (range.from < 25) onNeedMoreRef.current();
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
    const previousLogicalRange = chart.timeScale().getVisibleLogicalRange();
    const previousTimeRange = chart.timeScale().getVisibleRange();
    const sameDataset = datasetKeyRef.current === datasetKey;
    const wasFollowingLatest = sameDataset && previousLogicalRange !== null && previousLogicalRange.to >= dataLengthRef.current;
    series.setData(data);
    try { chart.priceScale("right").applyOptions({ autoScale: true }); } catch { /* chart not yet fully initialised */ }

    if (!sameDataset) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - visibleCandles) as Logical,
        to: (data.length + 2) as Logical,
      });
    } else if (previousLogicalRange && wasFollowingLatest) {
      const span = Math.max(6, previousLogicalRange.to - previousLogicalRange.from);
      const to = data.length + 2;
      chart.timeScale().setVisibleLogicalRange({ from: (to - span) as Logical, to: to as Logical });
    } else if (previousTimeRange) {
      chart.timeScale().setVisibleRange(previousTimeRange);
    }

    datasetKeyRef.current = datasetKey;
    dataLengthRef.current = data.length;
  }, [candles, datasetKey, visibleCandles]);

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
      from: Math.max(0, candles.length - visibleCandles) as Logical,
      to: (candles.length + 2) as Logical,
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

const CDN_URLS: ((slug: string) => string)[] = [
  (slug) => `https://assets.coincap.io/assets/icons/${slug}@2x.png`,
  (slug) => `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${slug}.png`,
  (slug) => `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${slug}.png`,
];

// Module-level cache: symbol → index of next CDN to try (CDN_URLS.length = all failed)
const iconCdnFailures = new Map<string, number>();

function CoinIcon({ symbol }: { symbol: string }) {
  const slug = symbol.toLowerCase();
  const [cdnIndex, setCdnIndex] = useState(() => iconCdnFailures.get(slug) ?? 0);

  // When symbol changes (same component instance reused), sync to the cached failure index for the new slug
  useEffect(() => {
    setCdnIndex(iconCdnFailures.get(slug) ?? 0);
  }, [slug]);

  if (cdnIndex >= CDN_URLS.length) {
    return <i aria-hidden="true">{symbol.slice(0, 2)}</i>;
  }

  return (
    <i aria-hidden="true">
      <img
        src={CDN_URLS[cdnIndex](slug)}
        alt=""
        width={22}
        height={22}
        style={{ objectFit: "contain" }}
        onError={() => {
          const next = cdnIndex + 1;
          iconCdnFailures.set(slug, next);
          setCdnIndex(next);
        }}
      />
    </i>
  );
}

type MarketResolvePayload = {
  resolved?: Market;
  unavailable?: string;
  alternatives?: string[];
  error?: string;
};

export default function MarketsView({
  request,
  onRequestChange,
  onBackToMonitor,
}: {
  request: MarketNavigationRequest | null;
  onRequestChange: (request: MarketNavigationRequest) => void;
  onBackToMonitor: () => void;
}) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<Market | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MARKET_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [interval, setInterval] = useState<MarketInterval>("15m");
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [marketsError, setMarketsError] = useState("");
  const [chartError, setChartError] = useState("");
  const [marketRequest, setMarketRequest] = useState(0);
  const [chartRetryRequest, setChartRetryRequest] = useState(0);
  const [asOf, setAsOf] = useState(0);
  const [lastLiveUpdate, setLastLiveUpdate] = useState(0);
  const [liveState, setLiveState] = useState<"connecting" | "live" | "delayed">("connecting");
  const [requestedMarketState, setRequestedMarketState] = useState<"idle" | "resolving" | "resolved" | "unavailable">("idle");
  const [requestedMarketMessage, setRequestedMarketMessage] = useState("");
  const [requestedAlternatives, setRequestedAlternatives] = useState<string[]>([]);
  const [highlightedSymbol, setHighlightedSymbol] = useState("");
  const candlesRef = useRef<Candle[]>([]);
  const historyLoadingRef = useRef(false);
  const intervalRef = useRef<MarketInterval>("15m");
  const resolvedRequestRef = useRef("");
  const marketListRef = useRef<HTMLDivElement>(null);
  const marketRowRefs = useRef(new Map<string, HTMLDivElement>());
  const highlightTimerRef = useRef<number | null>(null);
  const selectedSymbol = selected?.symbol ?? "";
  const datasetKey = selectedSymbol ? `${selectedSymbol}:${interval}` : "";
  const datasetKeyRef = useRef(datasetKey);
  const deferredQuery = useDeferredValue(query.trim().toUpperCase());
  const favoritesSnapshot = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getServerFavoritesSnapshot);
  const favorites = useMemo(() => parseFavorites(favoritesSnapshot), [favoritesSnapshot]);
  const trackedSnapshot = useSyncExternalStore(subscribeTracked, getTrackedSnapshot, getServerTrackedSnapshot);
  const tracked = useMemo(() => parseTracked(trackedSnapshot), [trackedSnapshot]);
  const requestedIdentityKey = request
    ? [
        request.tokenId ?? "",
        request.tokenSymbol,
        request.exchangeSymbol ?? "",
        request.exchangeVerified ? "verified" : "",
        request.chain ?? "",
        request.contractAddress ?? "",
        request.coingeckoId ?? "",
      ].join("|")
    : "";

  useEffect(() => {
    const stored = localStorage.getItem(MARKET_INTERVAL_STORAGE_KEY);
    const nextInterval = request?.interval ?? (isMarketInterval(stored) ? stored : "15m");
    intervalRef.current = nextInterval;
    setInterval(nextInterval);
  }, [request?.interval]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    datasetKeyRef.current = datasetKey;
  }, [datasetKey]);

  const applyLatestCandle = useCallback((symbol: string, candle: Candle) => {
    const updateMarket = (market: Market) => {
      if (market.symbol !== symbol) return market;
      const openPrice = numberValue(market.openPrice);
      return {
        ...market,
        lastPrice: String(candle.close),
        closeTime: Date.now(),
        changePercent: openPrice > 0 ? ((candle.close - openPrice) / openPrice) * 100 : market.changePercent,
      };
    };
    setSelected((current) => current ? updateMarket(current) : current);
    setMarkets((current) => current.map(updateMarket));
  }, []);

  const mergeRequestedMarket = useCallback((market: Market) => {
    setMarkets((current) => {
      const existingIndex = current.findIndex((item) => item.symbol === market.symbol);
      if (existingIndex < 0) return [market, ...current];
      const next = [...current];
      next[existingIndex] = market;
      return next;
    });
    setSelected(market);
    setQuery("");
    setFavoritesOnly(false);
    setRequestedMarketState("resolved");
    setRequestedMarketMessage("");
    setRequestedAlternatives([]);
    setHighlightedSymbol(market.symbol);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedSymbol(""), 2400);
  }, []);

  useEffect(() => {
    if (!request || !requestedIdentityKey) {
      resolvedRequestRef.current = "";
      setRequestedMarketState("idle");
      setRequestedMarketMessage("");
      setRequestedAlternatives([]);
      return;
    }
    if (resolvedRequestRef.current === requestedIdentityKey) return;
    resolvedRequestRef.current = requestedIdentityKey;
    const requested = request;

    const controller = new AbortController();
    const params = new URLSearchParams({
      symbol: requested.tokenSymbol,
      tokenName: requested.tokenName,
    });
    if (requested.tokenId) params.set("tokenId", String(requested.tokenId));
    const trustedSavedExchange = requested.source === "browse"
      || (
        requested.exchangeVerified
        && requested.preferredExchange?.toUpperCase() === "WEEX"
      );
    if (requested.exchangeSymbol && trustedSavedExchange) {
      params.set("exchangeSymbol", requested.exchangeSymbol);
    }
    if (requested.preferredExchange) params.set("preferredExchange", requested.preferredExchange);
    if (requested.chain) params.set("chain", requested.chain);
    if (requested.contractAddress) params.set("contractAddress", requested.contractAddress);
    if (requested.coingeckoId) params.set("coingeckoId", requested.coingeckoId);

    setSelected(null);
    setCandles([]);
    setRequestedMarketState("resolving");
    setRequestedMarketMessage("");
    setRequestedAlternatives([]);

    async function resolveRequestedMarket() {
      try {
        const response = await fetch(`/api/weex/resolve?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json() as MarketResolvePayload;
        if (controller.signal.aborted) return;
        if (response.ok && payload.resolved) {
          mergeRequestedMarket(payload.resolved);
          let exchangeVerified = requested.source === "browse";
          if (requested.tokenId) {
            try {
              const persistResponse = await fetch(`/api/tracked/tokens/${requested.tokenId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  preferred_exchange: "WEEX",
                  exchange_symbol: payload.resolved.symbol,
                }),
                signal: controller.signal,
              });
              if (controller.signal.aborted) return;
              if (persistResponse.ok) {
                const persisted = await persistResponse.json() as { exchange_symbol_verified_at?: string | null };
                exchangeVerified = Boolean(persisted.exchange_symbol_verified_at);
              }
            } catch {
              if (controller.signal.aborted) return;
            }
          }
          onRequestChange({
            ...requested,
            exchangeVerified,
            preferredExchange: exchangeVerified ? "WEEX" : undefined,
            exchangeSymbol: exchangeVerified ? payload.resolved.symbol : undefined,
            interval: intervalRef.current,
          });
          return;
        }
        setRequestedMarketState("unavailable");
        setRequestedMarketMessage(payload.unavailable || payload.error || `${requested.tokenSymbol}/USDT is not available from the connected exchange.`);
        setRequestedAlternatives(Array.isArray(payload.alternatives) ? payload.alternatives : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRequestedMarketState("unavailable");
        setRequestedMarketMessage(
          `${requested.tokenSymbol}/USDT is not available from the connected exchange.`,
        );
      }
    }

    void resolveRequestedMarket();
    return () => controller.abort();
  }, [requestedIdentityKey, request, mergeRequestedMarket, onRequestChange]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarkets() {
      setMarketsLoading(true);
      setMarketsError("");
      try {
        const response = await fetch("/api/weex/markets", { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { markets?: Market[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load WEEX markets.");
        const nextMarkets = Array.isArray(payload.markets) ? payload.markets : [];
        setMarkets(nextMarkets);
        setSelected((current) => current ? nextMarkets.find((market) => market.symbol === current.symbol) ?? current : current);
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
    if (!selectedSymbol) return;
    const controller = new AbortController();
    const requestKey = `${selectedSymbol}:${interval}`;
    historyLoadingRef.current = false;
    async function loadChart() {
      setHistoryLoading(false);
      setHasMoreHistory(true);
      setChartLoading(true);
      setChartError("");
      setLiveState("connecting");
      setLastLiveUpdate(0);
      try {
        const config = HISTORY_CONFIG[interval] ?? HISTORY_CONFIG["4h"];
        const params = new URLSearchParams({ symbol: selectedSymbol, interval, limit: String(config.initial) });
        const response = await fetch(`/api/weex/klines?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load this WEEX chart.");
        const rows = await response.json() as WeexKline[];
        const nextCandles = sanitizeRows(rows, interval);
        if (datasetKeyRef.current !== requestKey) return;
        candlesRef.current = nextCandles;
        setCandles(nextCandles);
        setHasMoreHistory(rows.length === config.initial);
        const latest = nextCandles.at(-1);
        if (latest) applyLatestCandle(selectedSymbol, latest);
        setLastLiveUpdate(Date.now());
        setLiveState("live");
      } catch (error) {
        if (controller.signal.aborted) return;
        setChartError(error instanceof Error ? error.message : "Unable to load this chart.");
        setCandles([]);
        setLiveState("delayed");
      } finally {
        if (!controller.signal.aborted) setChartLoading(false);
      }
    }
    void loadChart();
    return () => controller.abort();
  }, [selectedSymbol, interval, chartRetryRequest, applyLatestCandle]);

  useEffect(() => {
    if (!selectedSymbol || chartLoading || chartError || candlesRef.current.length === 0) return;
    const requestKey = `${selectedSymbol}:${interval}`;
    let activeController: AbortController | null = null;
    let disposed = false;
    let inFlight = false;

    async function refreshLiveChart() {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      activeController = new AbortController();
      try {
        const params = new URLSearchParams({ symbol: selectedSymbol, interval, limit: "3" });
        const response = await fetch(`/api/weex/klines?${params}`, { signal: activeController.signal, cache: "no-store" });
        if (!response.ok) throw new Error("The live WEEX candle feed is temporarily delayed.");
        const rows = await response.json() as WeexKline[];
        const freshCandles = sanitizeRows(rows, interval);
        if (disposed || datasetKeyRef.current !== requestKey || freshCandles.length === 0) return;
        const nextCandles = mergeCandles(candlesRef.current, freshCandles);
        candlesRef.current = nextCandles;
        setCandles(nextCandles);
        applyLatestCandle(selectedSymbol, freshCandles.at(-1)!);
        setLastLiveUpdate(Date.now());
        setLiveState("live");
      } catch {
        if (disposed || activeController.signal.aborted) return;
        setLiveState("delayed");
      } finally {
        inFlight = false;
      }
    }

    const timer = window.setInterval(refreshLiveChart, LIVE_CHART_POLL_MS);
    const refreshWhenVisible = () => document.visibilityState === "visible" && void refreshLiveChart();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [selectedSymbol, interval, chartLoading, chartError, applyLatestCandle]);

  const loadOlderCandles = useCallback(async () => {
    const currentCandles = candlesRef.current;
    if (!selectedSymbol || currentCandles.length === 0 || historyLoadingRef.current || !hasMoreHistory) return;
    const requestKey = `${selectedSymbol}:${interval}`;
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      const config = HISTORY_CONFIG[interval] ?? HISTORY_CONFIG["4h"];
      const params = new URLSearchParams({
        symbol: selectedSymbol,
        interval,
        endTime: String(currentCandles[0].time - 1),
        limit: String(config.page),
      });
      const response = await fetch(`/api/weex/klines?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load older WEEX candles.");
      const rows = await response.json() as WeexKline[];
      if (datasetKeyRef.current !== requestKey) return;
      const olderCandles = sanitizeRows(rows, interval).filter((candle) => candle.time < currentCandles[0].time);
      const merged = new Map(currentCandles.map((candle) => [candle.time, candle]));
      for (const candle of olderCandles) merged.set(candle.time, candle);
      const nextCandles = [...merged.values()].toSorted((left, right) => left.time - right.time);
      candlesRef.current = nextCandles;
      setCandles(nextCandles);
      setHasMoreHistory(rows.length === config.page && olderCandles.length > 0);
    } catch (error) {
      if (datasetKeyRef.current === requestKey) {
        setChartError(error instanceof Error ? error.message : "Unable to load older candles.");
      }
    } finally {
      historyLoadingRef.current = false;
      if (datasetKeyRef.current === requestKey) setHistoryLoading(false);
    }
  }, [selectedSymbol, interval, hasMoreHistory]);

  const filteredMarkets = useMemo(() => {
    const result = markets.filter((market) => {
      const matchesQuery = !deferredQuery || market.symbol.includes(deferredQuery) || market.baseAsset.includes(deferredQuery) || market.quoteAsset.includes(deferredQuery);
      const matchesFavorite = !favoritesOnly || favorites.has(market.symbol);
      return matchesQuery && matchesFavorite;
    });
    return result.toSorted((left, right) => numberValue(right.quoteVolume) - numberValue(left.quoteVolume));
  }, [markets, deferredQuery, favoritesOnly, favorites]);

  const visibleMarkets = filteredMarkets.slice(0, visibleCount);

  useEffect(() => {
    if (!selectedSymbol) return;
    const selectedIndex = filteredMarkets.findIndex((market) => market.symbol === selectedSymbol);
    if (selectedIndex >= visibleCount) setVisibleCount(selectedIndex + 1);
  }, [filteredMarkets, selectedSymbol, visibleCount]);

  useEffect(() => {
    if (!highlightedSymbol) return;
    const frame = window.requestAnimationFrame(() => {
      marketRowRefs.current.get(highlightedSymbol)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedSymbol, visibleMarkets.length]);

  useEffect(() => {
    document.title = selected
      ? `${selected.symbol} Market | Stop Loss`
      : "Markets | Stop Loss";
    return () => { document.title = "Stop Loss"; };
  }, [selected]);

  function updateSearch(value: string) {
    setQuery(value);
    setVisibleCount(MARKET_PAGE_SIZE);
  }

  function chooseMarket(market: Market) {
    setSelected(market);
    setRequestedMarketState("idle");
    setRequestedMarketMessage("");
    setRequestedAlternatives([]);
    onRequestChange({
      tokenName: market.baseAsset,
      tokenSymbol: market.baseAsset,
      preferredExchange: "WEEX",
      exchangeSymbol: market.symbol,
      source: "browse",
      interval,
    });
  }

  function chooseInterval(nextInterval: MarketInterval) {
    intervalRef.current = nextInterval;
    setInterval(nextInterval);
    localStorage.setItem(MARKET_INTERVAL_STORAGE_KEY, nextInterval);
    if (request) onRequestChange({ ...request, interval: nextInterval });
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

  function toggleTracked(baseAsset: string) {
    const next = new Set(tracked);
    if (next.has(baseAsset)) next.delete(baseAsset);
    else next.add(baseAsset);
    localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(TRACKED_CHANGED_EVENT));
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
          <div><h1>Markets</h1><p>Browse WEEX USDT perpetual markets and load any chart on demand.</p></div>
        </div>
        <div className="markets-connection"><span><i aria-hidden="true" /> WEEX connected</span><small>Same public read-only feed as the live engine</small></div>
      </header>

      <main className="markets-layout">
        <aside className="surface market-browser-panel">
          <header><div><h2>Exchange Markets</h2><p>{marketsLoading ? "Loading trading pairs…" : `${visibleMarkets.length.toLocaleString()} of ${filteredMarkets.length.toLocaleString()} pairs loaded`}</p></div><button type="button" disabled={marketsLoading} onClick={() => setMarketRequest((current) => current + 1)} aria-label="Refresh market prices">↻</button></header>
          <label className="market-search"><span aria-hidden="true">⌕</span><input type="search" value={query} placeholder="Search BTC, SOL, USDT…" aria-label="Search exchange markets" onChange={(event) => updateSearch(event.target.value)} /></label>
          <div className="market-browser-filters">
            <div className="market-source-label"><span aria-hidden="true">USDT</span> Perpetual contracts</div>
            <button className={`market-favorites-filter ${favoritesOnly ? "active" : ""}`} type="button" aria-pressed={favoritesOnly} onClick={toggleFavoritesOnly}><span aria-hidden="true">★</span> Favorites <b>{favorites.size}</b></button>
          </div>
          <div className="market-list-heading"><span>Pair</span><span>Price</span><span>24h</span><span aria-label="Favorite">★</span><span aria-label="Track">◎</span></div>
          <div className="market-list" ref={marketListRef} aria-live="polite" onScroll={loadMoreOnScroll}>
            {marketsLoading ? <div className="market-list-message"><span className="market-loader" />Connecting to WEEX…</div> : null}
            {!marketsLoading && marketsError ? <div className="market-list-message error"><strong>Market list unavailable</strong><span>{marketsError}</span><button type="button" onClick={() => setMarketRequest((current) => current + 1)}>Try again</button></div> : null}
            {!marketsLoading && !marketsError && filteredMarkets.length === 0 ? <div className="market-list-message">{favoritesOnly ? "No favorites match these filters yet." : "No trading pairs match these filters."}</div> : null}
            {!marketsLoading && !marketsError ? visibleMarkets.map((market) => {
              const change = percentChange(market);
              const favorite = favorites.has(market.symbol);
              const isTracked = tracked.has(market.baseAsset);
              return (
                <div
                  className={`market-list-row ${selected?.symbol === market.symbol ? "active" : ""} ${highlightedSymbol === market.symbol ? "requested" : ""}`}
                  key={market.symbol}
                  ref={(node) => {
                    if (node) marketRowRefs.current.set(market.symbol, node);
                    else marketRowRefs.current.delete(market.symbol);
                  }}
                >
                  <button className="market-row-select" type="button" aria-pressed={selected?.symbol === market.symbol} onClick={() => chooseMarket(market)}>
                    <span className="market-pair"><CoinIcon symbol={market.baseAsset} /><span><strong>{market.baseAsset}</strong><small>/{market.quoteAsset}</small></span></span>
                    <span className="market-row-price"><strong>{formatPrice(market.lastPrice, market.pricePrecision)}</strong><small>{formatVolume(market.quoteVolume)} {market.quoteAsset}</small></span>
                    <b className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</b>
                  </button>
                  <button className={`market-favorite-toggle ${favorite ? "active" : ""}`} type="button" aria-pressed={favorite} aria-label={`${favorite ? "Remove" : "Add"} ${market.symbol} ${favorite ? "from" : "to"} favorites`} onClick={() => toggleFavorite(market.symbol)}>★</button>
                  <button className={`market-track-toggle ${isTracked ? "active" : ""}`} type="button" aria-pressed={isTracked} aria-label={`${isTracked ? "Stop tracking" : "Track"} ${market.baseAsset}`} onClick={() => toggleTracked(market.baseAsset)}>◎</button>
                </div>
              );
            }) : null}
            {!marketsLoading && !marketsError && visibleMarkets.length < filteredMarkets.length ? <div className="market-list-progress"><span>Scroll for the next {Math.min(MARKET_PAGE_SIZE, filteredMarkets.length - visibleMarkets.length)} pairs</span><b>{visibleMarkets.length} / {filteredMarkets.length}</b></div> : null}
          </div>
          <footer><span>{asOf ? `Prices refreshed ${formatTime(asOf)}` : "Waiting for exchange"}</span><b>Read only</b></footer>
        </aside>

        <section className="surface market-chart-panel">
          {!selected ? (
            requestedMarketState === "resolving" ? (
              <div className="market-chart-empty market-request-state" role="status"><span className="market-loader" /><h2>Finding {request?.tokenSymbol} on WEEX</h2><p>Checking the saved market identity before loading a chart.</p></div>
            ) : requestedMarketState === "unavailable" ? (
              <div className="market-chart-empty market-request-state unavailable" role="alert">
                <span aria-hidden="true">!</span>
                <h2>Market unavailable</h2>
                <p>{requestedMarketMessage}</p>
                {requestedAlternatives.length > 0 && (
                  <div className="market-request-alternatives">
                    <strong>Other verified WEEX pairs</strong>
                    {requestedAlternatives.map((symbol) => <span key={symbol}>{symbol.replace(/([A-Z0-9]+)(USDC|USD|BTC|ETH|EUR)$/, "$1 / $2")}</span>)}
                  </div>
                )}
                <button className="market-back-monitor" type="button" onClick={onBackToMonitor}>← Back to Monitor Center</button>
              </div>
            ) : (
              <div className="market-chart-empty"><span aria-hidden="true">⌁</span><h2>Choose a coin to load its chart</h2><p>Select any WEEX USDT perpetual. Candle data is not downloaded until you make a selection.</p></div>
            )
          ) : (
            <>
              <header className="market-chart-header">
                <div className="market-selected-pair"><CoinIcon symbol={selected.baseAsset} /><span><h2>{selected.baseAsset}<small> / {selected.quoteAsset}</small></h2><p>WEEX perpetual · {selected.symbol}</p></span></div>
                <div className="market-last-price"><small>Last price</small><strong>{formatPrice(selected.lastPrice, selected.pricePrecision)}</strong><b className={selectedChange >= 0 ? "positive" : "negative"}>{selectedChange >= 0 ? "+" : ""}{selectedChange.toFixed(2)}%</b></div>
              </header>
              <div className="market-chart-toolbar">
                <div className="market-timeframes" aria-label="Chart timeframe">
                  {CHART_TIMEFRAMES.map(([value, label]) => <button className={interval === value ? "active" : ""} type="button" aria-pressed={interval === value} onClick={() => chooseInterval(value)} key={value}>{label}</button>)}
                </div>
                <div className={`market-live-status ${liveState}`} role="status"><span><i aria-hidden="true" />{liveState === "live" ? "Live" : liveState === "delayed" ? "Reconnecting" : "Connecting"}</span><small>{lastLiveUpdate ? `Updated ${formatTime(lastLiveUpdate)}` : "Waiting for first candle"}</small></div>
              </div>
              <div className="market-chart-frame">
                {chartLoading ? <div className="market-chart-loading"><span className="market-loader" />Loading {selected.symbol} candles…</div> : null}
                {!chartLoading && chartError ? <div className="market-chart-loading error"><strong>Chart unavailable</strong><span>{chartError}</span><button type="button" onClick={() => setChartRetryRequest((current) => current + 1)}>Try again</button></div> : null}
                {!chartLoading && !chartError ? <MarketChart candles={candles} datasetKey={datasetKey} historyLoading={historyLoading} hasMoreHistory={hasMoreHistory} onNeedMore={loadOlderCandles} visibleCandles={(HISTORY_CONFIG[interval] ?? HISTORY_CONFIG["4h"]).visible} /> : null}
              </div>
              <div className="market-stat-grid">
                <span><small>24h high</small><strong>{formatPrice(selected.highPrice, selected.pricePrecision)}</strong></span>
                <span><small>24h low</small><strong>{formatPrice(selected.lowPrice, selected.pricePrecision)}</strong></span>
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
