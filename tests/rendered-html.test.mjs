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
  assert.match(html, /Create and manage your trading signals/);
  assert.match(html, /Welcome to Signal Control/);
  assert.match(html, /Create New Signal/);
  assert.match(html, /View \/ Edit Signals/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps the application UI-only", async () => {
  const [page, styles, hosting, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(page, /score|decision|order execution|market feed/i);
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
  assert.match(page, /<button className="choice-card create-card"[\s\S]*<button className="choice-card view-card"/);
  assert.match(page, /<InnerNavigation activeView="create"[\s\S]*<InnerNavigation activeView="signals"/);
  assert.match(page, /placeholder=\{searchPlaceholder\}/);
  assert.match(styles, /\.ui-dropdown-options\.scrollable\s*\{[^}]*max-height:\s*186px;[^}]*overflow-y:\s*scroll/s);
  assert.match(styles, /\.ui-custom-duration-fields\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s);
  assert.match(styles, /\.ui-dropdown-menu\.align-above\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*52px/s);
  assert.match(styles, /\.ui-dropdown-menu\.cooldown-menu\s*\{[^}]*width:\s*360px;[^}]*max-width:\s*calc\(100vw - 40px\)/s);
});
