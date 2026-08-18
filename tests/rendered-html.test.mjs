import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Signal Control single page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Signal Control<\/title>/i);
  assert.match(html, /Create New Signal/);
  assert.match(html, /Build a new signal with your own rules, time frame, and trigger conditions/);
  assert.match(html, /Add Condition/);
  assert.doesNotMatch(html, /Welcome to Signal Control|What would you like to do\?/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps exchange access read-only and loads charts on demand", async () => {
  const [page, marketsPage, styles, hosting, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/markets.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(page, /decision engine|order execution|market feed/i);
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, null);
  assert.equal(hostingConfig.r2, null);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.doesNotMatch(packageJson, /drizzle|sqlite|postgres|supabase|firebase/i);
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
  assert.match(page, /type View = "create" \| "signals" \| "markets" \| "order-flow" \| "notifications" \| "profile"/);
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
  assert.match(page, /const PAGE_NAVIGATION:[\s\S]*Create Signal[\s\S]*View Signals[\s\S]*Markets[\s\S]*Order Flow[\s\S]*Notifications[\s\S]*Master ADMIN Profile/);
  assert.match(page, /const SIDEBAR_PRIMARY_NAV:[\s\S]*Dashboard[\s\S]*Create Signal[\s\S]*Signals[\s\S]*Backtesting[\s\S]*Trades[\s\S]*Analytics/);
  assert.doesNotMatch(page, /\["⌁", "Chart", null\]/);
  assert.match(page, /const SIDEBAR_SYSTEM_NAV:[\s\S]*\["◉", "Markets", "markets"\][\s\S]*Data Feeds[\s\S]*Users[\s\S]*Alerts[\s\S]*Integrations/);
  assert.match(page, /const SIDEBAR_SETTINGS_NAV:[\s\S]*General[\s\S]*Trading[\s\S]*Risk[\s\S]*Order Flow[\s\S]*Logs/);
  assert.match(page, /className=\{`application-menu-trigger \$\{sidebarOpen \? "open" : ""\}`\}[\s\S]*aria-expanded=\{sidebarOpen\}/);
  assert.match(page, /function ProfileView[\s\S]*Master ADMIN Profile[\s\S]*Executive control account[\s\S]*Full site configuration control[\s\S]*Override lower-tier permissions[\s\S]*Modify, suspend, or delete accounts[\s\S]*Notification Settings[\s\S]*Manage Accounts/);
  assert.match(page, /className="master-profile-trigger"[\s\S]*aria-current=\{activeView === "profile" \? "page" : undefined\}[\s\S]*onClick=\{\(\) => setView\("profile"\)\}/);
  assert.match(page, /view === "profile" && <ProfileView setView=\{setView\} \/>/);
  assert.doesNotMatch(page, /master-profile-menu|profileOpen|profileMenuId/);
  assert.doesNotMatch(page, /function InnerNavigation|function FlowSidebar/);
  assert.doesNotMatch(styles, /\.view-navigation/);
  assert.doesNotMatch(styles, /\.page-menu|\.hamburger-trigger|\.of-sidebar/);
  assert.match(styles, /\.application-shell\s*\{[^}]*grid-template-columns:\s*var\(--sidebar-width\) minmax\(0, 1fr\)/s);
  assert.match(styles, /\.application-shell\.sidebar-open\s*\{[^}]*--sidebar-width:\s*292px/s);
  assert.match(styles, /\.application-sidebar-scroll\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.profile-layout\s*\{[^}]*grid-template-columns:/s);
  assert.doesNotMatch(styles, /\.master-profile-menu/);
  assert.match(page, /view === "markets" && <MarketsView \/>/);
  assert.match(marketsPage, /Browse Binance Spot pairs and load any chart on demand/);
  assert.match(marketsPage, /https:\/\/data-api\.binance\.vision[\s\S]*\/api\/v3\/exchangeInfo[\s\S]*\/api\/v3\/ticker\/24hr\?type=MINI[\s\S]*\/api\/v3\/klines/);
  assert.match(marketsPage, /if \(!selected\) return;[\s\S]*loadChart/);
  assert.match(marketsPage, /Candle data is not downloaded until you make a selection/);
  assert.doesNotMatch(marketsPage, /\/api\/v3\/(order|account)|X-MBX-APIKEY|secretKey/i);
  assert.match(marketsPage, /const MARKET_PAGE_SIZE = 20/);
  assert.match(marketsPage, /useState\("ALL"\)[\s\S]*filteredMarkets\.slice\(0, visibleCount\)/);
  assert.match(marketsPage, /function loadMoreOnScroll[\s\S]*nearBottom[\s\S]*current \+ MARKET_PAGE_SIZE/);
  assert.match(marketsPage, /onScroll=\{loadMoreOnScroll\}/);
  assert.match(marketsPage, /FAVORITES_STORAGE_KEY[\s\S]*localStorage\.getItem[\s\S]*localStorage\.setItem/);
  assert.match(marketsPage, /market-favorites-filter[\s\S]*Favorites[\s\S]*market-favorite-toggle/);
  assert.match(styles, /\.markets-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.market-list\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.market-list-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.market-favorite-toggle\.active\s*\{[^}]*color:\s*#ffd357/s);
  assert.doesNotMatch(styles, /\.of-page\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.of-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(680px, 1fr\) 311px/s);
  assert.match(styles, /\.of-gauge-arc\s*\{[^}]*conic-gradient/s);
});
