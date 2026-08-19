import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps exchange access read-only and loads charts on demand", async () => {
  const [page, marketsPage, assetTrackingPage, weexMarketsRoute, weexKlinesRoute, weexMarketsHelper, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/markets.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/asset-tracking.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weex/markets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weex/klines/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/weex-markets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const systemNavigation = page.match(/const SIDEBAR_SYSTEM_NAV:[\s\S]*?\];/)?.[0] ?? "";

  assert.doesNotMatch(page, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(page, /decision engine|order execution|market feed/i);
  assert.match(styles, /\.condition-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\)/s);
  assert.doesNotMatch(styles, /\.modal-backdrop\s*\{[^}]*padding-top:\s*133px/s);
  assert.match(page, /const TIMEFRAME_OPTIONS:[\s\S]*value: "1s"[\s\S]*value: "3h"[\s\S]*value: "5d"[\s\S]*value: "14d"[\s\S]*value: "15d"[\s\S]*value: "1Y"/);
  assert.match(page, /const searchable = options\.length > 4/);
  assert.doesNotMatch(page, /COOLDOWN_OPTIONS|Search cooldown|allowCustomDuration/);
  assert.doesNotMatch(page, /FREQUENCY_OPTIONS|Trigger Frequency|frequency controls/i);
  assert.match(page, /function CooldownChooser[\s\S]*Days[\s\S]*Hours[\s\S]*Minutes[\s\S]*Use cooldown/);
  assert.match(page, /onChange\(`custom:\$\{dayValue\}:\$\{hourValue\}:\$\{minuteValue\}`\)/);
  assert.match(page, /useState\("custom:0:0:5"\)/);
  assert.match(page, /<CooldownChooser value=\{cooldown\} onChange=\{setCooldown\} \/>/);
  assert.match(page, /cooldownSummaryLabel\(cooldown\)/);
  assert.match(page, /<SidebarNavigation activeView=\{view\}[\s\S]*<ApplicationTopbar activeView=\{view\}/);
  assert.match(page, /placeholder=\{searchPlaceholder\}/);
  assert.match(styles, /\.ui-dropdown-options\.scrollable\s*\{[^}]*max-height:\s*186px;[^}]*overflow-y:\s*scroll/s);
  assert.match(styles, /\.ui-custom-duration-fields\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s);
  assert.match(styles, /\.ui-dropdown-menu\.align-above\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*52px/s);
  assert.match(styles, /\.ui-dropdown-menu\.cooldown-menu\s*\{[^}]*width:\s*360px;[^}]*max-width:\s*calc\(100vw - 40px\)/s);
  assert.match(page, /type View = "create" \| "signals" \| "markets" \| "asset-tracking" \| "order-flow" \| "notifications" \| "profile"/);
  assert.doesNotMatch(page, /function HomeView|view === "home"|setView\("home"\)/);
  assert.doesNotMatch(styles, /\.home-screen|\.home-header|\.home-main|\.choice-card/);
  assert.match(page, /function OrderFlowView[\s\S]*Order Flow Settings[\s\S]*Timeframe Configuration[\s\S]*Minimum Imbalance Threshold[\s\S]*Minimum Confidence Score/);
  assert.match(page, /const ORDER_FLOW_TIMEFRAME_OPTIONS:[\s\S]*value: "1m"[\s\S]*value: "5m"[\s\S]*value: "15m"[\s\S]*value: "30m"[\s\S]*value: "1H"[\s\S]*value: "4H"[\s\S]*value: "1D"/);
  assert.match(page, /className="of-timeframe-select"[\s\S]*<UiDropdown[\s\S]*options=\{ORDER_FLOW_TIMEFRAME_OPTIONS\}[\s\S]*searchPlaceholder="Search timeframes\.\.\."/);
  assert.doesNotMatch(page, /className="of-timeframes"/);
  assert.match(page, /Reset to Defaults[\s\S]*Save Changes[\s\S]*Order Flow Preview/);
  assert.match(page, /Bullish Confidence/);
  assert.match(page, /\["order-flow", "⇄", "Order Flow"/);
  assert.match(page, /function NotificationsView[\s\S]*Notification Settings[\s\S]*Email address[\s\S]*Phone number[\s\S]*Discord webhook URL/);
  assert.match(page, /Interface preview:[\s\S]*not stored or sent/);
  assert.match(page, /\["notifications", "♢", "Notifications"/);
  assert.match(page, /type="checkbox" checked=\{checked\} aria-label=\{ariaLabel\}/);
  assert.match(styles, /\.notifications-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.notification-switch input:checked \+ span/s);
  assert.match(page, /const PAGE_NAVIGATION:[\s\S]*Create Signal[\s\S]*View Signals[\s\S]*Markets[\s\S]*Asset Tracking[\s\S]*Order Flow[\s\S]*Notifications[\s\S]*Master ADMIN Profile/);
  assert.match(page, /const SIDEBAR_PRIMARY_NAV:[\s\S]*Dashboard[\s\S]*Signals/);
  assert.match(page, /id=\{label === "Signals" \? "signals-nav-button" : label === "Dashboard" \? "dashboard-nav-button" : undefined\}/);
  assert.match(page, /aria-expanded=\{label === "Dashboard" \? expandedSection === "dashboard" : label === "Signals" \? expandedSection === "signals" : undefined\}/);
  assert.match(page, /disabled=\{!destination && label !== "Dashboard"\}/);
  assert.match(page, /!\s*destination && label !== "Dashboard" \? <small>Soon<\/small>/);
  assert.match(page, /id="trades-under-dashboard"[\s\S]*SidebarIcon name="trades"[\s\S]*Trades[\s\S]*Soon/);
  assert.doesNotMatch(page, /Backtesting/);
  assert.doesNotMatch(page, /Analytics/);
  assert.doesNotMatch(page, /id="create-signal-nav-button"/);
  assert.doesNotMatch(page, /view-edit-signals-from-create/);
  assert.match(page, /id="view-edit-signals-nav-button"[\s\S]*View\/Edit Signals/);
  assert.match(page, /id="create-signal-under-signals"[\s\S]*Create Signal/);
  assert.doesNotMatch(page, /\["⌁", "Chart", null\]/);
  assert.match(page, /const SIDEBAR_SYSTEM_NAV:[\s\S]*\["markets", "Markets", "markets"\][\s\S]*\["admin", "Admin", "profile"\][\s\S]*Integrations/);
  assert.doesNotMatch(systemNavigation, /Users/);
  assert.doesNotMatch(page, /adminExpanded|admin-subnav|users-under-admin/);
  assert.doesNotMatch(systemNavigation, /Alerts/);
  assert.doesNotMatch(page, /Data Feeds/);
  assert.match(page, /const SIDEBAR_SETTINGS_NAV:[\s\S]*General[\s\S]*Trading[\s\S]*Risk[\s\S]*Order Flow[\s\S]*Logs/);
  assert.match(page, /className="application-settings-label"[\s\S]*aria-expanded=\{settingsExpanded\}[\s\S]*aria-controls="settings-subnav"/);
  assert.match(page, /\{settingsExpanded && \([\s\S]*className="application-sidebar-subnav settings-subnav"[\s\S]*id="settings-subnav"/);
  assert.doesNotMatch(styles, /\.application-settings-nav/);
  assert.doesNotMatch(page, /SIDEBAR_SETTINGS_NAV\.map\(\(\[icon, label, destination\]\)/);
  assert.match(page, /const SIDEBAR_MONITORING_NAV:[\s\S]*Asset Tracking[\s\S]*Notifications/);
  assert.doesNotMatch(page.match(/const SIDEBAR_MONITORING_NAV:[\s\S]*?\];/)?.[0] ?? "", /Watchlists/);
  assert.match(page, /className=\{`application-menu-trigger \$\{sidebarOpen \? "open" : ""\}`\}[\s\S]*aria-expanded=\{sidebarOpen\}/);
  assert.match(page, /function ProfileView[\s\S]*Master ADMIN Profile[\s\S]*Executive control account[\s\S]*Full site configuration control[\s\S]*Override lower-tier permissions[\s\S]*Modify, suspend, or delete accounts[\s\S]*Notification Settings[\s\S]*Manage Accounts/);
  assert.match(page, /className="master-profile-trigger"[\s\S]*aria-current=\{activeView === "profile" \? "page" : undefined\}[\s\S]*onClick=\{\(\) => setView\("profile"\)\}/);
  assert.match(page, /view === "profile" && <ProfileView setView=\{navigate\} \/>/);
  assert.doesNotMatch(page, /master-profile-menu|profileOpen|profileMenuId/);
  assert.doesNotMatch(page, /function InnerNavigation|function FlowSidebar/);
  assert.doesNotMatch(styles, /\.view-navigation/);
  assert.doesNotMatch(styles, /\.page-menu|\.hamburger-trigger|\.of-sidebar/);
  assert.match(styles, /\.application-shell\s*\{[^}]*grid-template-columns:\s*var\(--sidebar-width\) minmax\(0, 1fr\)/s);
  assert.match(styles, /\.application-shell\.sidebar-open\s*\{[^}]*--sidebar-width:\s*292px/s);
  assert.match(styles, /\.application-sidebar-scroll\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.application-sidebar-nav\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.profile-layout\s*\{[^}]*grid-template-columns:/s);
  assert.doesNotMatch(styles, /\.master-profile-menu/);
  assert.match(page, /lazy\(\(\) => import\("\.\/markets"\)\)/);
  assert.match(page, /view === "markets" && <Suspense[\s\S]*<MarketsView request=\{marketRequest\}[\s\S]*onRequestChange=\{updateMarketRequest\}[\s\S]*<\/Suspense>/);
  assert.match(page, /lazy\(\(\) => import\("\.\/asset-tracking"\)\)/);
  assert.match(page, /view === "asset-tracking" && <Suspense[\s\S]*<AssetTrackingView onOpenInMarkets=\{openTokenInMarkets\}[\s\S]*<\/Suspense>/);
  assert.match(assetTrackingPage, /Monitor Center[\s\S]*Watched Tokens[\s\S]*Watched Wallets/);
  assert.match(assetTrackingPage, /Add Token[\s\S]*Add Wallet[\s\S]*Import List/);
  assert.doesNotMatch(assetTrackingPage, /Selected Token Intelligence/);
  assert.doesNotMatch(assetTrackingPage, /Selected Wallet Intelligence/);
  assert.match(assetTrackingPage, /className="tracking-intelligence"/);
  assert.match(assetTrackingPage, /tracking-api-notice[\s\S]{0,400}tracking-table-head/);
  assert.match(styles, /\.tracking-table-body\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(assetTrackingPage, /role="dialog"/);
  assert.match(assetTrackingPage, /Search Token or Paste Contract/);
  assert.match(assetTrackingPage, /Wallet Address/);
  assert.doesNotMatch(assetTrackingPage, /Discovered Tokens/);
  assert.doesNotMatch(assetTrackingPage, /fetch\s*\(\s*["'`]https?:|XMLHttpRequest|WebSocket|EventSource/);
  assert.match(styles, /Monitor Center refinement[\s\S]*\.tracking-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(370px, 390px\)/s);
  assert.match(styles, /\.tracking-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\)[^}]*overflow-y:\s*auto/s);
  assert.match(marketsPage, /Browse WEEX USDT perpetual markets and load any chart on demand/);
  assert.match(marketsPage, /fetch\("\/api\/weex\/markets"[\s\S]*fetch\(`\/api\/weex\/klines\?\$\{params\}`/);
  assert.doesNotMatch(marketsPage, /data-api\.binance\.vision|Binance Spot/);
  assert.match(weexMarketsRoute, /fetchWeexMarkets[\s\S]*rawSymbol[\s\S]*marketType: "USDT perpetuals"/);
  assert.match(weexMarketsHelper, /https:\/\/api-contract\.weex\.com[\s\S]*\/capi\/v3\/market\/exchangeInfo[\s\S]*\/capi\/v2\/market\/tickers/);
  assert.match(weexMarketsHelper, /replace\(\/\^CMT_\/[\s\S]*changeRatio \* 100[\s\S]*pricePrecision/);
  assert.match(weexKlinesRoute, /\/capi\/v3\/market\/klines[\s\S]*\/capi\/v3\/market\/historyKlines/);
  assert.match(weexKlinesRoute, /priceType", "LAST"/);
  assert.doesNotMatch(weexMarketsRoute + weexKlinesRoute, /apiKey|secretKey|Authorization|\/order|\/account/i);
  assert.match(marketsPage, /if \(!selectedSymbol\) return;[\s\S]*loadChart/);
  assert.match(marketsPage, /Candle data is not downloaded until you make a selection/);
  assert.doesNotMatch(marketsPage, /\/api\/v3\/(order|account)|X-MBX-APIKEY|secretKey/i);
  // CoinIcon: multi-CDN fallback chain with per-symbol failure cache
  assert.match(marketsPage, /const CDN_URLS:[\s\S]*coincap\.io[\s\S]*jsdelivr\.net/);
  assert.match(marketsPage, /const iconCdnFailures = new Map/);
  assert.match(marketsPage, /useState\(\(\) => iconCdnFailures\.get\(slug\)/);
  assert.match(marketsPage, /useEffect\(\(\) => \{[\s\S]*setCdnIndex\(iconCdnFailures\.get\(slug\)/);
  assert.match(marketsPage, /\[slug\]\)/);
  assert.match(marketsPage, /iconCdnFailures\.set\(slug, next\)/);
  assert.match(marketsPage, /const MARKET_PAGE_SIZE = 20/);
  assert.match(marketsPage, /filteredMarkets\.slice\(0, visibleCount\)/);
  assert.match(marketsPage, /function loadMoreOnScroll[\s\S]*nearBottom[\s\S]*current \+ MARKET_PAGE_SIZE/);
  assert.match(marketsPage, /onScroll=\{loadMoreOnScroll\}/);
  assert.match(marketsPage, /FAVORITES_STORAGE_KEY[\s\S]*localStorage\.getItem[\s\S]*localStorage\.setItem/);
  assert.match(marketsPage, /market-favorites-filter[\s\S]*Favorites[\s\S]*market-favorite-toggle/);
  assert.match(packageJson, /"lightweight-charts": "\^5\.2\.0"/);
  assert.match(marketsPage, /createChart\([\s\S]*CandlestickSeries/);
  assert.match(marketsPage, /handleScroll:[\s\S]*mouseWheel: true[\s\S]*pressedMouseMove: true/);
  assert.match(marketsPage, /handleScale:[\s\S]*mouseWheel: true[\s\S]*pinch: true/);
  assert.match(marketsPage, /range\.from < 25[\s\S]*subscribeVisibleLogicalRangeChange/);
  assert.match(marketsPage, /const HISTORY_CONFIG:[\s\S]*"1m": \{ initial: 360, visible: 100, page: 100 \}[\s\S]*"5m": \{ initial: 360, visible: 110, page: 100 \}/);
  assert.match(marketsPage, /function cleanCandle[\s\S]*high < Math\.max\(open, close\)[\s\S]*upperWick > wickLimit[\s\S]*time % bucket !== 0/);
  assert.match(marketsPage, /function sanitizeRows[\s\S]*new Map<number, Candle>[\s\S]*toSorted/);
  assert.doesNotMatch(marketsPage, /chartPrecision|priceFormat: \{ type: "price"/);
  assert.match(marketsPage, /getVisibleLogicalRange\(\)[\s\S]*getVisibleRange\(\)[\s\S]*wasFollowingLatest[\s\S]*setVisibleRange\(previousTimeRange\)/);
  assert.match(marketsPage, /endTime: String\(currentCandles\[0\]\.time - 1\)/);
  assert.match(marketsPage, /aria-label="Zoom in"[\s\S]*aria-label="Zoom out"[\s\S]*Latest/);
  assert.match(marketsPage, /const LIVE_CHART_POLL_MS = 5_000/);
  assert.match(marketsPage, /function mergeCandles[\s\S]*new Map\(current\.map[\s\S]*toSorted/);
  assert.match(marketsPage, /limit: "3"[\s\S]*window\.setInterval\(refreshLiveChart, LIVE_CHART_POLL_MS\)/);
  assert.match(marketsPage, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(marketsPage, /setLastLiveUpdate\(Date\.now\(\)\)[\s\S]*setLiveState\("live"\)/);
  assert.match(marketsPage, /market-live-status[\s\S]*Reconnecting[\s\S]*Waiting for first candle/);
  assert.doesNotMatch(marketsPage, /Refresh chart|market-chart-refresh/);
  assert.match(styles, /\.market-live-status\s*\{[^}]*display:\s*grid/s);
  assert.doesNotMatch(styles, /\.market-chart-refresh/);
  assert.doesNotMatch(styles, /\.market-candle-layer|\.market-candle-slot|\.market-price-axis/);
  assert.match(styles, /\.markets-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.market-list\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.market-list-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.market-favorite-toggle\.active\s*\{[^}]*color:\s*#ffd357/s);
  assert.doesNotMatch(styles, /\.of-page\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.of-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(680px, 1fr\) 311px/s);
  assert.match(styles, /\.of-gauge-arc\s*\{[^}]*conic-gradient/s);
});

test("removing a token prunes stale live-price data and guards against in-flight responses", async () => {
  const assetTrackingPage = await readFile(
    new URL("../app/asset-tracking.tsx", import.meta.url),
    "utf8",
  );

  // A ref must be kept in sync with the current tracked-symbol set so that
  // async fetch callbacks can read it after the state has already changed.
  assert.match(assetTrackingPage, /trackedSymbolsRef\s*=\s*useRef/);
  assert.match(assetTrackingPage, /trackedSymbolsRef\.current\s*=\s*new Set\(dbTokens\.map/);

  // The live-price fetch result must be filtered through the ref so a response
  // that arrives after a deletion cannot re-insert the removed symbol.
  assert.match(
    assetTrackingPage,
    /trackedSymbolsRef\.current[\s\S]{0,300}filter\(\(\[sym\]\) => currentSymbols\.has\(sym\)\)/,
  );

  // The removeToken function must: (1) check res.ok before touching state,
  // (2) prune liveData immediately, and (3) only then await refreshTokens —
  // all three in that order.
  const removeStart = assetTrackingPage.indexOf("const removeToken");
  const okGuard = assetTrackingPage.indexOf("if (!res.ok) return", removeStart);
  const liveEviction = assetTrackingPage.indexOf("next.delete(token.symbol)", okGuard);
  const refresh = assetTrackingPage.indexOf("await refreshTokens()", liveEviction);
  assert.ok(removeStart >= 0 && okGuard > removeStart, "removeToken must guard failed DELETE responses");
  assert.ok(liveEviction > okGuard, "removeToken must evict stale live-price data after a successful DELETE");
  assert.ok(refresh > liveEviction, "removeToken must refresh persisted tokens after local live-price eviction");
});

test("last-updated timestamp only advances on a genuine successful price fetch", async () => {
  const assetTrackingPage = await readFile(
    new URL("../app/asset-tracking.tsx", import.meta.url),
    "utf8",
  );

  // The r.ok guard must exist to prevent failed responses from advancing the timestamp.
  assert.match(assetTrackingPage, /if \(!r\.ok\) return/);

  // setLastUpdated must be present.
  assert.match(assetTrackingPage, /setLastUpdated\(new Date\(\)\)/);

  // setLastUpdated must come AFTER the r.ok guard so non-OK responses cannot
  // trigger it and falsely report a fresh update.
  const okGuardIdx = assetTrackingPage.indexOf("if (!r.ok) return");
  const setLastUpdatedIdx = assetTrackingPage.indexOf("setLastUpdated(new Date())");
  assert.ok(okGuardIdx !== -1, "r.ok guard must exist in asset-tracking.tsx");
  assert.ok(setLastUpdatedIdx > okGuardIdx, "setLastUpdated must appear after the r.ok guard");

  // liveData and lastUpdated must only be updated when the filtered response
  // payload contains at least one price entry (empty {} treated as failure).
  assert.match(
    assetTrackingPage,
    /Object\.keys\(filtered\)\.length > 0[\s\S]{0,200}setLastUpdated\(new Date\(\)\)/,
  );

  // The timestamp element must be rendered outside the grid table-head to
  // avoid overlapping column headings at narrow widths.
  assert.match(
    assetTrackingPage,
    /tracking-last-updated[\s\S]{0,60}Updated[\s\S]{0,200}tracking-table-wrap/,
  );
});
