"use client";

import { Fragment, lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  readMarketRequest,
  writeMarketRequest,
  type MarketNavigationRequest,
} from "@/lib/market-navigation";

const MarketsView = lazy(() => import("./markets"));
const AssetTrackingView = lazy(() => import("./asset-tracking"));

type View = "create" | "signals" | "markets" | "asset-tracking" | "order-flow" | "notifications" | "profile";
type DropdownOption = { value: string; label: string };

const VIEWS = new Set<View>(["create", "signals", "markets", "asset-tracking", "order-flow", "notifications", "profile"]);

const TIMEFRAME_OPTIONS: DropdownOption[] = [
  { value: "1s", label: "1 Second (1s)" },
  { value: "1m", label: "1 Minute (1m)" },
  { value: "3m", label: "3 Minutes (3m)" },
  { value: "5m", label: "5 Minutes (5m)" },
  { value: "15m", label: "15 Minutes (15m)" },
  { value: "30m", label: "30 Minutes (30m)" },
  { value: "1h", label: "1 Hour (1h)" },
  { value: "2h", label: "2 Hours (2h)" },
  { value: "3h", label: "3 Hours (3h)" },
  { value: "4h", label: "4 Hours (4h)" },
  { value: "6h", label: "6 Hours (6h)" },
  { value: "8h", label: "8 Hours (8h)" },
  { value: "12h", label: "12 Hours (12h)" },
  { value: "1d", label: "1 Day (1d)" },
  { value: "2d", label: "2 Days (2d)" },
  { value: "3d", label: "3 Days (3d)" },
  { value: "5d", label: "5 Days (5d)" },
  { value: "1w", label: "1 Week (1w)" },
  { value: "14d", label: "14 Days (14d)" },
  { value: "15d", label: "15 Days (15d)" },
  { value: "1M", label: "1 Month (1M)" },
  { value: "3M", label: "3 Months (3M)" },
  { value: "6M", label: "6 Months (6M)" },
  { value: "1Y", label: "1 Year (1Y)" },
];

const TRIGGER_OPTIONS = ["Bollinger Squeeze", "Bollinger Touch"];
type SidebarIconName =
  | "dashboard" | "signals" | "trades" | "markets" | "users" | "alerts" | "integrations"
  | "general" | "trading" | "risk" | "order-flow" | "logs" | "asset-tracking" | "watchlists"
  | "notifications" | "create-signal" | "view-signals";

const PAGE_NAVIGATION: ReadonlyArray<readonly [View, string, string, string]> = [
  ["create", "＋", "Create Signal", "Build a new trading signal"],
  ["signals", "☷", "View Signals", "Manage existing signals"],
  ["markets", "◉", "Markets", "Browse live WEEX futures markets"],
  ["asset-tracking", "◎", "Asset Tracking", "Monitor watched tokens and wallets"],
  ["order-flow", "⇄", "Order Flow", "Configure order-flow analysis"],
  ["notifications", "♢", "Notifications", "Choose where alerts are sent"],
  ["profile", "♛", "Master ADMIN Profile", "Executive account and site controls"],
];

const SIDEBAR_PRIMARY_NAV: ReadonlyArray<readonly [SidebarIconName, string, View | null]> = [
  ["dashboard", "Dashboard", null],
  ["signals", "Signals", "signals"],
  ["trades", "Trades", null],
];

const SIDEBAR_SYSTEM_NAV: ReadonlyArray<readonly [SidebarIconName, string, View | null]> = [
  ["markets", "Markets", "markets"],
  ["users", "Users", null],
  ["integrations", "Integrations", null],
];

const SIDEBAR_SETTINGS_NAV: ReadonlyArray<readonly [string, View | null]> = [
  ["General", null],
  ["Trading", null],
  ["Risk", null],
  ["Order Flow", "order-flow"],
  ["Logs", null],
];

const SIDEBAR_MONITORING_NAV: ReadonlyArray<readonly [SidebarIconName, string, View | null]> = [
  ["asset-tracking", "Asset Tracking", "asset-tracking"],
  ["watchlists", "Watchlists", null],
  ["notifications", "Notifications", "notifications"],
];

const SIDEBAR_ICON_PATHS: Record<SidebarIconName, string> = {
  dashboard: "M3 3h4v4H3zM13 3h4v4h-4zM3 13h4v4H3zM13 13h4v4h-4z",
  signals: "M3 12a9 9 0 0 1 18 0M6 12a6 6 0 0 1 12 0M9 12a3 3 0 0 1 6 0M12 12h.01",
  trades: "M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3",
  markets: "M4 17V9m5 8V5m5 12v-4m5 4V3M2 20h20",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-7a4 4 0 0 1 0 7.75",
  alerts: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  integrations: "M8 12h8M12 8v8M7 3h3v4H7a3 3 0 0 0 0 6h3v4H7a7 7 0 0 1 0-14Zm10 0h-3v4h3a3 3 0 0 1 0 6h-3v4h3a7 7 0 0 0 0-14Z",
  general: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-5 4v4",
  trading: "M5 7h14M5 17h14M5 7l3-3m-3 3 3 3m11 7-3-3m3 3-3 3",
  risk: "M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z",
  "order-flow": "M4 18h4v-6h4V6h4V3h4",
  logs: "M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6",
  "asset-tracking": "M12 5c-5 0-9 7-9 7s4 7 9 7 9-7 9-7-4-7-9-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z",
  watchlists: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3.1 9.6l6.1-.9L12 3Z",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  "create-signal": "M12 5v14M5 12h14",
  "view-signals": "M5 6h14M5 12h14M5 18h14",
};

function SidebarIcon({ name }: { name: SidebarIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={SIDEBAR_ICON_PATHS[name]} />
    </svg>
  );
}

function cooldownSummaryLabel(value: string) {
  if (!value.startsWith("custom:")) return "not set";

  const [days, hours, minutes] = value.slice(7).split(":").map(Number);
  return [
    days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : "",
    hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "",
    minutes > 0 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : "",
  ].filter(Boolean).join(" ") || "not set";
}

function cooldownCompactLabel(value: string) {
  if (!value.startsWith("custom:")) return "Set cooldown";
  const [days, hours, minutes] = value.slice(7).split(":").map(Number);
  return [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : "", minutes > 0 ? `${minutes}m` : ""].filter(Boolean).join(" ") || "Set cooldown";
}

function UiDropdown({
  label,
  required = false,
  value,
  options,
  onChange,
  searchPlaceholder = "Search options...",
}: {
  label: React.ReactNode;
  required?: boolean;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? options[0].label;
  const searchable = options.length > 4;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery))
    : options;
  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className="form-field dropdown-field" ref={rootRef}>
      <span id={labelId}>{label} {required && <b>*</b>}</span>
      <button
        className={`ui-dropdown-button ${open ? "open" : ""}`}
        type="button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => open ? closeMenu() : setOpen(true)}
        onKeyDown={(event) => event.key === "Escape" && closeMenu()}
      >
        <span>{selectedLabel}</span><i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="ui-dropdown-menu" id={listId}>
          {searchable && (
            <label className="ui-dropdown-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && closeMenu()}
              />
            </label>
          )}
          <div
            className={`ui-dropdown-options ${searchable ? "scrollable" : ""}`}
            role="listbox"
            aria-labelledby={labelId}
            tabIndex={0}
            onKeyDown={(event) => event.key === "Escape" && closeMenu()}
          >
            {filteredOptions.map((option) => (
              <button
                className={`ui-dropdown-option ${option.value === value ? "selected" : ""}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  closeMenu();
                }}
              >
                <span>{option.label}</span><b aria-hidden="true">✓</b>
              </button>
            ))}
            {filteredOptions.length === 0 && <div className="ui-dropdown-empty" role="status">No matching options</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function CooldownChooser({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const initialParts = value.startsWith("custom:") ? value.slice(7).split(":") : ["0", "0", "0"];
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(initialParts[0] || "0");
  const [hours, setHours] = useState(initialParts[1] || "0");
  const [minutes, setMinutes] = useState(initialParts[2] || "0");
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const panelId = useId();
  const dayValue = Math.max(0, Number.parseInt(days, 10) || 0);
  const hourValue = Math.max(0, Number.parseInt(hours, 10) || 0);
  const minuteValue = Math.max(0, Number.parseInt(minutes, 10) || 0);
  const hasDuration = dayValue + hourValue + minuteValue > 0;

  function closeMenu() {
    setOpen(false);
  }

  function applyCooldown() {
    if (!hasDuration) return;
    onChange(`custom:${dayValue}:${hourValue}:${minuteValue}`);
    closeMenu();
  }

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className="form-field dropdown-field" ref={rootRef}>
      <span id={labelId}>Cooldown Period (Optional) <small>?</small></span>
      <button
        className={`ui-dropdown-button ${open ? "open" : ""}`}
        type="button"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => event.key === "Escape" && closeMenu()}
      >
        <span>{cooldownCompactLabel(value)}</span><i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="ui-dropdown-menu align-above cooldown-menu" id={panelId} role="group" aria-labelledby={labelId}>
          <div className="ui-custom-duration-panel">
            <p>Type any combination of days, hours, and minutes.</p>
            <div className="ui-custom-duration-fields">
              <label><span>Days</span><input type="number" min="0" step="1" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} onKeyDown={(event) => event.key === "Escape" && closeMenu()} /></label>
              <label><span>Hours</span><input type="number" min="0" step="1" inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} onKeyDown={(event) => event.key === "Escape" && closeMenu()} /></label>
              <label><span>Minutes</span><input type="number" min="0" step="1" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} onKeyDown={(event) => event.key === "Escape" && closeMenu()} /></label>
            </div>
            <button className="ui-custom-duration-apply" type="button" disabled={!hasDuration} onClick={applyCooldown}>Use cooldown</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "signal-mark compact" : "signal-mark"} aria-hidden="true">
      <span className="signal-mark-ring ring-two" />
      <span className="signal-mark-dot" />
      <span className="signal-mark-stem" />
      <span className="signal-mark-base" />
    </span>
  );
}

function SidebarNavigation({ activeView, open, setView }: { activeView: View; open: boolean; setView: (view: View) => void }) {
  const tabIndex = open ? 0 : -1;
  const [expandedSection, setExpandedSection] = useState<"signals" | null>(null);

  function selectPrimary(label: string, destination: View | null) {
    if (!destination) return;
    if (label === "Signals") {
      setExpandedSection(current => current === "signals" ? null : "signals");
      setView("signals");
      return;
    }
    setView(destination);
  }

  return (
    <aside className="application-sidebar" aria-hidden={!open}>
      <div className="application-sidebar-scroll">
        <button className="application-brand bg-[#060f1c] flex-col" type="button" tabIndex={tabIndex} onClick={() => setView("create")}>
          <img src="/logo.png" alt="Stop Loss" style={{ height: "73px", width: "auto", objectFit: "contain", margin: "0 auto", display: "block", padding: "12px 0" }} />
        </button>

        <nav className="application-sidebar-nav" aria-label="Main navigation">
          {SIDEBAR_PRIMARY_NAV.map(([icon, label, destination]) => (
            <Fragment key={label}>
              <button
                id={label === "Signals" ? "signals-nav-button" : undefined}
                className={destination && (activeView === destination || (label === "Signals" && expandedSection === "signals")) ? "active" : ""}
                type="button"
                tabIndex={tabIndex}
                disabled={!destination}
                aria-current={destination && activeView === destination ? "page" : undefined}
                aria-expanded={label === "Signals" ? expandedSection === "signals" : undefined}
                key={label}
                onClick={() => selectPrimary(label, destination)}
              >
                <span className="application-sidebar-icon"><SidebarIcon name={icon} /></span><span>{label}</span>{!destination ? <small>Soon</small> : null}
              </button>
              {expandedSection === "signals" && label === "Signals" && (
                <div className="application-sidebar-subnav">
                  <button id="create-signal-under-signals" className={activeView === "create" ? "active" : ""} type="button" tabIndex={tabIndex} onClick={() => setView("create")}>
                    <span className="application-sidebar-subnav-icon"><SidebarIcon name="create-signal" /></span><span>Create Signal</span>
                  </button>
                  <button id="view-edit-signals-nav-button" className={activeView === "signals" ? "active" : ""} type="button" tabIndex={tabIndex} onClick={() => setView("signals")}>
                    <span className="application-sidebar-subnav-icon"><SidebarIcon name="view-signals" /></span><span>View/Edit Signals</span>
                  </button>
                </div>
              )}
            </Fragment>
          ))}

          <h2>System</h2>
          {SIDEBAR_SYSTEM_NAV.map(([icon, label, destination]) => (
            <button className={destination && activeView === destination ? "active" : ""} type="button" tabIndex={tabIndex} disabled={!destination} aria-current={destination && activeView === destination ? "page" : undefined} key={label} onClick={() => destination && setView(destination)}><span className="application-sidebar-icon"><SidebarIcon name={icon} /></span><span>{label}</span>{!destination ? <small>Soon</small> : null}</button>
          ))}

          <div className="application-settings-label"><span className="application-sidebar-icon"><SidebarIcon name="general" /></span><strong>Settings</strong></div>
          <div className="application-settings-nav">
            {SIDEBAR_SETTINGS_NAV.map(([label, destination]) => (
              <button className={destination && activeView === destination ? "active" : ""} type="button" tabIndex={tabIndex} disabled={!destination} aria-current={destination && activeView === destination ? "page" : undefined} key={label} onClick={() => destination && setView(destination)}>
                {label}{!destination ? <small>Soon</small> : null}
              </button>
            ))}
          </div>

          <h2>Monitoring</h2>
          {SIDEBAR_MONITORING_NAV.map(([icon, label, destination]) => (
            <button className={destination && activeView === destination ? "active" : ""} type="button" tabIndex={tabIndex} disabled={!destination} aria-current={destination && activeView === destination ? "page" : undefined} key={label} onClick={() => destination && setView(destination)}>
              <span className="application-sidebar-icon"><SidebarIcon name={icon} /></span><span>{label}</span>{!destination ? <small>Soon</small> : null}
            </button>
          ))}
        </nav>

      </div>
    </aside>
  );
}

function ApplicationTopbar({ activeView, sidebarOpen, toggleSidebar, setView }: { activeView: View; sidebarOpen: boolean; toggleSidebar: () => void; setView: (view: View) => void }) {
  const currentPage = PAGE_NAVIGATION.find(([view]) => view === activeView) ?? PAGE_NAVIGATION[0];

  return (
    <header id="Windowheader" className="application-topbar">
      <button className={`application-menu-trigger ${sidebarOpen ? "open" : ""}`} type="button" aria-label={sidebarOpen ? "Collapse navigation menu" : "Open navigation menu"} aria-expanded={sidebarOpen} onClick={toggleSidebar}>
        <span aria-hidden="true">{sidebarOpen ? "‹" : "›"}</span>
      </button>
      <div className="application-page-context"></div>

      <button className="master-profile-trigger" type="button" aria-current={activeView === "profile" ? "page" : undefined} onClick={() => setView("profile")}>
        <span className="master-avatar">MA</span>
        <span><strong>Master ADMIN</strong><small>Top-tier access</small></span>
        <i aria-hidden="true">›</i>
      </button>
    </header>
  );
}

function SummaryIcon({ children, tone = "purple" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`summary-icon ${tone}`} aria-hidden="true">{children}</span>;
}

function CreateView({ setView, openCondition }: { setView: (view: View) => void; openCondition: () => void }) {
  const [timeFrame, setTimeFrame] = useState("15m");
  const [cooldown, setCooldown] = useState("custom:0:0:5");

  return (
    <div className="screen inner-screen create-screen">
      <header className="inner-header mt-[10px] mb-[10px]">
        <div className="inner-title">
          <div>
            <h1>Create New Signal</h1>
            <p>Build a new signal with your own rules, time frame, and trigger conditions.</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="outline-button" type="button">Save as Draft</button>
          <button className="purple-button" type="button">Create Signal</button>
        </div>
      </header>

      <main className="create-layout">
        <div className="create-column">
          <section className="surface basic-section">
            <h2>1. Basic Information</h2>
            <div className="two-fields">
              <label className="form-field">
                <span>Signal Name <b>*</b></span>
                <input type="text" placeholder="e.g., Bollinger Squeeze 15 Minute" />
              </label>
              <UiDropdown label="Time Frame" required value={timeFrame} options={TIMEFRAME_OPTIONS} onChange={setTimeFrame} searchPlaceholder="Search timeframes..." />
            </div>
            <div className="info-strip"><span>ⓘ</span> Choose a name and time frame for your signal.</div>
          </section>

          <section className="surface conditions-section">
            <div className="section-row">
              <div>
                <h2>2. Conditions</h2>
                <p>Define the conditions that must be met to trigger this signal.</p>
              </div>
              <button className="add-condition-button" type="button" onClick={openCondition}>
                <span>＋</span> Add Condition
              </button>
            </div>
            <div className="empty-condition">
              <div className="empty-list-icon" aria-hidden="true"><i /><i /><i /></div>
              <strong>No conditions added yet</strong>
              <p>Add one or more conditions to define when this signal should trigger.</p>
            </div>
          </section>

          <section className="surface settings-section">
            <h2>3. Additional Settings</h2>
            <p>Configure the cooldown and optional notifications for this signal.</p>
            <div className="settings-fields">
              <CooldownChooser value={cooldown} onChange={setCooldown} />
              <div className="notification-field">
                <span>Notifications (Optional) <small>?</small></span>
                <label className="toggle-row"><input type="checkbox" defaultChecked aria-label="Enable notifications when triggered" /> <em>Enable notifications when triggered</em></label>
                <button className="configure-notifications" type="button" onClick={() => setView("notifications")}>Set delivery methods <span aria-hidden="true">→</span></button>
              </div>
            </div>
            <div className="info-strip"><span>ⓘ</span> Cooldown prevents the same signal from triggering repeatedly too quickly.</div>
          </section>
        </div>

        <aside className="surface summary-panel">
          <h2>Signal Summary</h2>
          <p>This is how your signal will be configured.</p>
          <div className="summary-divider" />
          <div className="summary-row"><SummaryIcon>♒</SummaryIcon><span>Signal Name</span><b>Not set</b></div>
          <div className="summary-row"><SummaryIcon tone="blue">◷</SummaryIcon><span>Time Frame</span><b>Not set</b></div>
          <div className="summary-row align-top"><SummaryIcon>☷</SummaryIcon><span>Conditions (0)<small>No conditions added<br />This signal will trigger when conditions are added.</small></span></div>
          <div className="summary-divider" />
          <div className="summary-row"><SummaryIcon tone="green">●</SummaryIcon><span>Status</span><b>Active</b></div>
          <div className="summary-row"><SummaryIcon tone="amber">◴</SummaryIcon><span>Cooldown Period</span><b>{cooldownSummaryLabel(cooldown)}</b></div>
          <div className="summary-row"><SummaryIcon>♧</SummaryIcon><span>Notifications</span><b>Enabled</b></div>
          <div className="summary-note"><span>ⓘ</span><p>Your signal will be evaluated on every new bar<br />close based on the selected time frame.</p></div>
        </aside>
      </main>
    </div>
  );
}

function RowIcon({ glyph }: { glyph: string }) {
  return <span className="row-icon" aria-hidden="true">{glyph}</span>;
}

function SignalRow({ glyph, name, type, typeTone, frame, triggers, status, modified }: {
  glyph: string; name: string; type: string; typeTone: string; frame: string; triggers: string; status: "Active" | "Paused"; modified: string;
}) {
  return (
    <div className="signal-row">
      <div className="signal-name-cell"><RowIcon glyph={glyph} /><strong>{name}</strong></div>
      <div className={`signal-type ${typeTone}`}><span>{typeTone === "purple" ? "⌁" : typeTone === "blue" ? "≋" : "⌁"}</span>{type}</div>
      <div>{frame}</div>
      <div>{triggers}</div>
      <div><span className={`status-pill ${status.toLowerCase()}`}><i />{status}</span></div>
      <div className="modified-cell">{modified}</div>
      <div className="row-actions"><button type="button" aria-label={`Edit ${name}`}>⌕</button><button type="button" aria-label={`More options for ${name}`}>⋮</button></div>
    </div>
  );
}

function SignalsView() {
  return (
    <div className="screen inner-screen signals-screen">
      <header className="list-header">
        <div><h1>View / Edit Signals</h1><p>View, edit, and manage all of your existing signals.</p></div>
      </header>

      <main className="signals-panel surface">
        <div className="signals-toolbar">
          <div className="toolbar-title"><span className="toolbar-icon">☷</span><div><h2>Your Signals <b>8</b></h2><p>Manage and monitor all of your created signals.</p></div></div>
          <div className="toolbar-actions"><label className="search-box"><span>⌕</span><input type="search" placeholder="Search signals..." /></label><button className="filter-button" type="button"><span>▽</span> Filter <small>⌄</small></button></div>
        </div>
        <div className="table-head"><span>Name</span><span>Type</span><span>Time Frame</span><span>Triggers</span><span>Status</span><span>Last Modified</span><span>Actions</span></div>
        <div className="signal-table">
          <SignalRow glyph="⌁" name="Bollinger Squeeze 15 Minute" type="Bollinger Squeeze" typeTone="green" frame="15m" triggers="1 Active" status="Active" modified="May 15, 2025  2:34 PM" />
          <SignalRow glyph="♧" name="Bollinger Touch 5 Minute" type="Bollinger Touch" typeTone="purple" frame="5m" triggers="2 Active" status="Active" modified="May 14, 2025  11:20 AM" />
          <SignalRow glyph="↗" name="Squeeze Breakout 1 Hour" type="Bollinger Squeeze" typeTone="green" frame="1h" triggers="1 Active" status="Active" modified="May 13, 2025  3:45 PM" />
          <SignalRow glyph="⊙" name="RSI Oversold Bounce 1 Hour" type="RSI Condition" typeTone="amber" frame="1h" triggers="1 Active" status="Paused" modified="May 12, 2025  9:15 AM" />
          <SignalRow glyph="▥" name="MA Crossover 4 Hour" type="MA Crossover" typeTone="blue" frame="4h" triggers="2 Active" status="Active" modified="May 10, 2025  4:42 PM" />
          <SignalRow glyph="⬡" name="Support Bounce 30 Minute" type="Price Action" typeTone="amber" frame="30m" triggers="1 Active" status="Active" modified="May 9, 2025  7:30 PM" />
          <SignalRow glyph="ϟ" name="Momentum Spike 5 Minute" type="Momentum" typeTone="blue" frame="5m" triggers="1 Active" status="Active" modified="May 8, 2025  1:10 PM" />
          <SignalRow glyph="◉" name="Volume Breakout 15 Minute" type="Volume" typeTone="blue" frame="15m" triggers="2 Active" status="Paused" modified="May 7, 2025  10:05 AM" />
        </div>
        <div className="table-footer"><span>Showing 1 to 8 of 8 signals</span><div><button type="button" aria-label="Previous page">‹</button><button className="current" type="button">1</button><button type="button" aria-label="Next page">›</button></div></div>
      </main>
    </div>
  );
}

type OrderFlowValues = {
  imbalance: number;
  imbalanceLookback: number;
  differential: number;
  volumeMultiplier: number;
  volumeLookback: number;
  confidence: number;
};

const DEFAULT_ORDER_FLOW_VALUES: OrderFlowValues = {
  imbalance: 60,
  imbalanceLookback: 60,
  differential: 10,
  volumeMultiplier: 1.5,
  volumeLookback: 60,
  confidence: 70,
};

const ORDER_FLOW_TIMEFRAME_OPTIONS: DropdownOption[] = [
  { value: "1m", label: "1 Minute (1m)" },
  { value: "5m", label: "5 Minutes (5m)" },
  { value: "15m", label: "15 Minutes (15m)" },
  { value: "30m", label: "30 Minutes (30m)" },
  { value: "1H", label: "1 Hour (1H)" },
  { value: "4H", label: "4 Hours (4H)" },
  { value: "1D", label: "1 Day (1D)" },
];

function FlowSettingRow({
  title,
  description,
  value,
  min,
  max,
  step = 1,
  unit,
  hint,
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hint: string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  const displayValue = step < 1 ? value.toFixed(2) : String(value);

  return (
    <div className="of-setting-row">
      <div className="of-setting-copy"><strong>{title} <span aria-hidden="true">ⓘ</span></strong><small>{description}</small></div>
      <input
        className="of-range"
        type="range"
        aria-label={title}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--flow-progress": `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <label className="of-value-box">
        <span className="sr-only">{title} value</span>
        <input type="number" min={min} max={max} step={step} value={displayValue} onChange={(event) => onChange(Number(event.target.value))} />
        <b>{unit}</b>
      </label>
      <p>{hint}</p>
    </div>
  );
}

function FlowSelectRow({ title, description, value, options, hint, onChange }: {
  title: string;
  description: string;
  value: string;
  options: string[];
  hint: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="of-setting-row select-row">
      <div className="of-setting-copy"><strong>{title} <span aria-hidden="true">ⓘ</span></strong><small>{description}</small></div>
      <label className="of-select-wrap">
        <span className="sr-only">{title}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <p>{hint}</p>
    </div>
  );
}

function FlowGauge() {
  return (
    <div className="of-gauge-wrap" role="img" aria-label="Bullish confidence 78 percent">
      <div className="of-gauge"><span className="of-gauge-arc" /><span className="of-gauge-needle" /></div>
      <strong>78%</strong>
      <b>Bullish Confidence</b>
      <small>Strong Confirmation</small>
    </div>
  );
}

function OrderFlowView() {
  const [timeframe, setTimeframe] = useState("5m");
  const [enabled, setEnabled] = useState(true);
  const [values, setValues] = useState<OrderFlowValues>(DEFAULT_ORDER_FLOW_VALUES);
  const [confluence, setConfluence] = useState("Imbalance + Volume");
  const [direction, setDirection] = useState("Strict (Must Align)");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState("Last saved: 2 minutes ago");

  function setValue(key: keyof OrderFlowValues, value: number) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function resetDefaults() {
    setTimeframe("5m");
    setEnabled(true);
    setValues(DEFAULT_ORDER_FLOW_VALUES);
    setConfluence("Imbalance + Volume");
    setDirection("Strict (Must Align)");
    setLastSaved("Defaults restored");
  }

  return (
    <div className="of-page">
      <main className="of-main">
        <header className="of-header">
          <div className="of-breadcrumb"><span>Settings</span><b>›</b><strong>Order Flow</strong></div>
          <div className="of-title-row"><h1>Order Flow Settings</h1><span>Advanced</span></div>
          <p>Configure order flow analysis parameters by timeframe. These settings control how order flow<br />confirmation is calculated across the platform.</p>
          <button className="of-help" type="button"><span aria-hidden="true">?</span> How Order Flow Works</button>
          <div className="of-header-actions">
            <button type="button" onClick={resetDefaults}>Reset to Defaults</button>
            <button className="save" type="button" onClick={() => setLastSaved("Last saved: just now")}><span aria-hidden="true">▣</span> Save Changes</button>
          </div>
        </header>

        <div className="of-workspace">
          <section className="of-config-panel">
            <div className="of-tabs" role="tablist" aria-label="Order flow settings sections">
              <button className="active" type="button" role="tab" aria-selected="true">Timeframe Configuration</button>
              <button type="button" role="tab" aria-selected="false">Global Settings</button>
            </div>
            <div className="of-timeframe-bar">
              <div className="of-timeframe-select">
                <UiDropdown
                  label="Timeframe"
                  value={timeframe}
                  options={ORDER_FLOW_TIMEFRAME_OPTIONS}
                  onChange={setTimeframe}
                  searchPlaceholder="Search timeframes..."
                />
              </div>
              <label className="of-enable"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span />Enable Order Flow</label>
            </div>

            <div className="of-settings-table">
              <h2>Imbalance Settings</h2>
              <FlowSettingRow title="Minimum Imbalance Threshold" description="Minimum buy/sell imbalance required" value={values.imbalance} min={0} max={100} unit="%" hint="Higher = stricter confirmation" onChange={(value) => setValue("imbalance", value)} />
              <FlowSettingRow title="Imbalance Lookback Window" description="Time window to calculate imbalance" value={values.imbalanceLookback} min={1} max={120} unit="min" hint="Compares against historical average" onChange={(value) => setValue("imbalanceLookback", value)} />
              <FlowSettingRow title="Imbalance Differential" description="Current imbalance must exceed historical average by" value={values.differential} min={0} max={50} unit="%" hint="Filters out weak imbalances" onChange={(value) => setValue("differential", value)} />
              <h2>Volume Confirmation</h2>
              <FlowSettingRow title="Minimum Volume Multiplier" description="Current volume vs average volume" value={values.volumeMultiplier} min={1} max={3} step={0.05} unit="x" hint="1.50x = 50% above average" onChange={(value) => setValue("volumeMultiplier", value)} />
              <FlowSettingRow title="Volume Lookback Window" description="Window for average volume calculation" value={values.volumeLookback} min={1} max={120} unit="min" hint="Should match market conditions" onChange={(value) => setValue("volumeLookback", value)} />
              <h2>Confirmation Settings</h2>
              <FlowSettingRow title="Minimum Confidence Score" description="Overall confidence required for confirmation" value={values.confidence} min={0} max={100} unit="%" hint="0-100% confidence threshold" onChange={(value) => setValue("confidence", value)} />
              <FlowSelectRow title="Require Confluence" description="Require multiple conditions to align" value={confluence} options={["Imbalance + Volume", "Imbalance Only", "Volume Only"]} hint="More confluence = higher quality" onChange={setConfluence} />
              <FlowSelectRow title="Confirmation Direction" description="How strict should direction matching be" value={direction} options={["Strict (Must Align)", "Allow Minor Divergence", "Flexible"]} hint="Strict or Allow Minor Divergence" onChange={setDirection} />
            </div>

            <button className="of-advanced" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((current) => !current)}>
              <span>Advanced Filters (Optional)</span><b aria-hidden="true">⌄</b>
            </button>
            {advancedOpen ? <div className="of-advanced-content">Additional order flow filters will appear here.</div> : null}
            <div className="of-status-bar">
              <span>Changes are applied in real-time to new signals. Existing signals will use new settings on next evaluation.</span>
              <b aria-live="polite">{lastSaved} <i aria-hidden="true">✓</i></b>
            </div>
          </section>

          <aside className="of-insights">
            <section className="of-card preview-card">
              <header><strong>Order Flow Preview</strong><span><i /> Live</span></header>
              <FlowGauge />
              <div className="of-preview-stats"><span>Imbalance <b>65%</b></span><span>Volume <b>1.62x</b></span><span>Confluence <b>High</b></span><span>Overall <b>78%</b></span></div>
            </section>
            <section className="of-card about-card">
              <h2>About These Settings</h2>
              <p>These parameters determine how order flow confirmation is calculated.</p>
              <div className="of-about-item purple"><i>↕</i><span><strong>Imbalance</strong><small>Measures the ratio of aggressive buys to sells in the order book and trades.</small></span></div>
              <div className="of-about-item blue"><i>◴</i><span><strong>Volume</strong><small>Confirms that the imbalance is supported by meaningful volume.</small></span></div>
              <div className="of-about-item amber"><i>⌘</i><span><strong>Confluence</strong><small>Ensures multiple factors align before confirming a signal.</small></span></div>
              <button type="button">Learn more about order flow <span aria-hidden="true">↗</span></button>
            </section>
            <section className="of-card apply-card">
              <h2>Apply to All Timeframes</h2>
              <p>Copy current {timeframe} settings to all timeframes</p>
              <button type="button"><span aria-hidden="true">⌘</span> Apply to All</button>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ProfileView({ setView }: { setView: (view: View) => void }) {
  return (
    <div className="screen inner-screen profile-screen">
      <header className="profile-header">
        <div className="inner-title">
          <span className="profile-hero-icon" aria-hidden="true">♛</span>
          <div><h1>Master ADMIN Profile</h1><p>Executive account overview and site-level controls.</p></div>
        </div>
        <span className="profile-status"><i aria-hidden="true" /> Active master account</span>
      </header>

      <main className="profile-layout">
        <section className="surface profile-identity-card">
          <div className="profile-identity-main">
            <span className="master-avatar profile-avatar">MA</span>
            <div><span className="profile-role-badge">MASTER</span><h2>Master ADMIN</h2><p>Executive control account</p></div>
          </div>
          <div className="profile-account-facts">
            <span><small>Account tier</small><strong>Top level</strong></span>
            <span><small>Site access</small><strong>Full control</strong></span>
            <span><small>Account status</small><strong className="profile-online">Active</strong></span>
          </div>
        </section>

        <section className="surface profile-authority-card">
          <header><span aria-hidden="true">⌾</span><div><h2>Authority Scope</h2><p>Capabilities assigned to the site&apos;s highest-level account.</p></div></header>
          <div className="profile-authority-list">
            <p><span>✓</span><strong>Full site configuration control</strong><small>Change every available setting and interface option.</small></p>
            <p><span>✓</span><strong>Override lower-tier permissions</strong><small>Take control when another account&apos;s access conflicts with an executive decision.</small></p>
            <p><span>✓</span><strong>Modify, suspend, or delete accounts</strong><small>Manage every future account and role from one place.</small></p>
          </div>
        </section>

        <section className="profile-control-grid" aria-label="Profile controls">
          <button className="surface profile-control-card" type="button" onClick={() => setView("notifications")}>
            <span className="profile-control-icon purple" aria-hidden="true">♢</span>
            <span><strong>Notification Settings</strong><small>Choose email, SMS, and Discord destinations for automatic alerts.</small></span>
            <b aria-hidden="true">›</b>
          </button>
          <button className="surface profile-control-card" type="button" disabled>
            <span className="profile-control-icon blue" aria-hidden="true">♧</span>
            <span><strong>Manage Accounts</strong><small>Create roles, modify access, or remove accounts when user management is added.</small></span>
            <em>Coming later</em>
          </button>
          <button className="surface profile-control-card" type="button" disabled>
            <span className="profile-control-icon green" aria-hidden="true">⌘</span>
            <span><strong>Roles &amp; Permissions</strong><small>Define what future account tiers are allowed to see and change.</small></span>
            <em>Coming later</em>
          </button>
        </section>

        <section className="profile-prototype-note"><span>ⓘ</span><p><strong>Interface preview:</strong> this page shows the intended Master ADMIN authority. Identity verification, account storage, and permission enforcement are not connected yet.</p></section>
      </main>
    </div>
  );
}

function NotificationSwitch({ checked, label, ariaLabel, onChange }: { checked: boolean; label: string; ariaLabel: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="notification-switch">
      <input type="checkbox" checked={checked} aria-label={ariaLabel} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" />
      <b>{label}</b>
    </label>
  );
}

function NotificationChannelCard({
  icon,
  tone,
  title,
  description,
  fieldLabel,
  placeholder,
  type,
  value,
  enabled,
  helper,
  onValueChange,
  onEnabledChange,
  onPreview,
}: {
  icon: string;
  tone: "purple" | "blue" | "green";
  title: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
  type: "email" | "tel" | "url";
  value: string;
  enabled: boolean;
  helper: string;
  onValueChange: (value: string) => void;
  onEnabledChange: (enabled: boolean) => void;
  onPreview: () => void;
}) {
  return (
    <section className={`surface notification-channel-card ${tone}`}>
      <header>
        <span className="notification-channel-icon" aria-hidden="true">{icon}</span>
        <div><h2>{title}</h2><p>{description}</p></div>
        <NotificationSwitch checked={enabled} label={enabled ? "On" : "Off"} ariaLabel={`Enable ${title} notifications`} onChange={onEnabledChange} />
      </header>
      <label className="notification-contact-field">
        <span>{fieldLabel}</span>
        <div>
          <input type={type} value={value} autoComplete={type === "email" ? "email" : type === "tel" ? "tel" : "off"} placeholder={placeholder} onChange={(event) => onValueChange(event.target.value)} />
          <button type="button" disabled={!enabled || !value.trim()} onClick={onPreview}>Preview test</button>
        </div>
        <small>{helper}</small>
      </label>
    </section>
  );
}

function NotificationRule({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="notification-rule">
      <span><strong>{title}</strong><small>{description}</small></span>
      <NotificationSwitch checked={checked} label={checked ? "On" : "Off"} ariaLabel={`Send notifications for ${title}`} onChange={onChange} />
    </div>
  );
}

function NotificationsView() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [discord, setDiscord] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [rules, setRules] = useState({ triggered: true, invalidated: true, orderFlow: false, risk: true });
  const [notice, setNotice] = useState("No settings have been saved in this preview.");
  const configuredChannels = [emailEnabled && email.trim(), smsEnabled && phone.trim(), discordEnabled && discord.trim()].filter(Boolean).length;

  function updateRule(key: keyof typeof rules, checked: boolean) {
    setRules((current) => ({ ...current, [key]: checked }));
  }

  return (
    <div className="screen inner-screen notifications-screen">
      <header className="notifications-header">
        <div className="inner-title">
          <span className="notifications-hero-icon" aria-hidden="true">♢</span>
          <div><h1>Notification Settings</h1><p>Choose where automatic signal alerts should be delivered.</p></div>
        </div>
        <button className="purple-button notification-save" type="button" onClick={() => setNotice("Settings updated for this session only.")}>Save Settings</button>
      </header>

      <div className="notification-prototype-note"><span>ⓘ</span><p><strong>Interface preview:</strong> contact details stay only on this page and are not stored or sent. Secure delivery connections will be added with the backend later.</p></div>

      <main className="notifications-layout">
        <div className="notification-channels">
          <div className="notifications-section-heading"><div><h2>Delivery Methods</h2><p>Add the destinations that should receive alerts.</p></div><span>{configuredChannels} configured</span></div>
          <NotificationChannelCard icon="@" tone="purple" title="Email" description="Send detailed alerts to an inbox." fieldLabel="Email address" placeholder="you@example.com" type="email" value={email} enabled={emailEnabled} helper="Use an address you check when trading." onValueChange={setEmail} onEnabledChange={setEmailEnabled} onPreview={() => setNotice(`Email preview prepared for ${email}.`)} />
          <NotificationChannelCard icon="◫" tone="blue" title="Text Message" description="Send short, urgent alerts by SMS." fieldLabel="Phone number" placeholder="+1 (555) 000-0000" type="tel" value={phone} enabled={smsEnabled} helper="Include the country code, such as +1." onValueChange={setPhone} onEnabledChange={setSmsEnabled} onPreview={() => setNotice(`SMS preview prepared for ${phone}.`)} />
          <NotificationChannelCard icon="#" tone="green" title="Discord" description="Post alerts directly into a Discord channel." fieldLabel="Discord webhook URL" placeholder="https://discord.com/api/webhooks/..." type="url" value={discord} enabled={discordEnabled} helper="Paste the webhook URL from the Discord channel that should receive alerts." onValueChange={setDiscord} onEnabledChange={setDiscordEnabled} onPreview={() => setNotice("Discord alert preview prepared.")} />
        </div>

        <aside className="notification-preferences">
          <section className="surface notification-rules-card">
            <h2>Automatic Alerts</h2>
            <p>Choose which events should send a notification.</p>
            <NotificationRule title="Signal triggered" description="A rule reaches its entry conditions." checked={rules.triggered} onChange={(checked) => updateRule("triggered", checked)} />
            <NotificationRule title="Signal invalidated" description="Conditions fail after a signal appears." checked={rules.invalidated} onChange={(checked) => updateRule("invalidated", checked)} />
            <NotificationRule title="Order-flow confirmation" description="Order flow confirms a market direction." checked={rules.orderFlow} onChange={(checked) => updateRule("orderFlow", checked)} />
            <NotificationRule title="Risk warning" description="Price approaches a stop or danger level." checked={rules.risk} onChange={(checked) => updateRule("risk", checked)} />
          </section>
          <section className="surface notification-summary-card">
            <h2>Delivery Summary</h2>
            <div><span>Email</span><b className={emailEnabled && email.trim() ? "ready" : "waiting"}>{emailEnabled && email.trim() ? "Ready" : "Needs address"}</b></div>
            <div><span>Text Message</span><b className={smsEnabled && phone.trim() ? "ready" : "waiting"}>{smsEnabled && phone.trim() ? "Ready" : "Not configured"}</b></div>
            <div><span>Discord</span><b className={discordEnabled && discord.trim() ? "ready" : "waiting"}>{discordEnabled && discord.trim() ? "Ready" : "Not configured"}</b></div>
            <p className="notification-live-status" aria-live="polite">{notice}</p>
          </section>
          <section className="surface notification-security-card"><span aria-hidden="true">⌾</span><div><h2>Keep contact details private</h2><p>Notification destinations should be encrypted and never exposed inside public alert messages.</p></div></section>
        </aside>
      </main>
    </div>
  );
}

function ConditionModal({ close }: { close: () => void }) {
  const [triggerOpen, setTriggerOpen] = useState(true);
  const [trigger, setTrigger] = useState("Bollinger Squeeze");

  function chooseTrigger(value: string) {
    setTrigger(value);
    setTriggerOpen(false);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="condition-dialog" role="dialog" aria-modal="true" aria-labelledby="condition-title">
        <div className="dialog-header"><h2 id="condition-title">Add Condition</h2><button type="button" onClick={close} aria-label="Close">×</button></div>
        <label className="dialog-field"><span>Name <b>*</b></span><input type="text" placeholder="e.g., Bollinger Squeeze Condition 1" /><small>Give this condition a unique name.</small></label>
        <div className="dialog-field"><span>Condition Type</span><button className="select-face" type="button"><i className="bollinger-glyph">⌁</i><strong>Bollinger</strong><em>⌄</em></button></div>
        <div className="dialog-field trigger-field"><span>Trigger</span><button className={`select-face ${triggerOpen ? "selected" : ""}`} type="button" onClick={() => setTriggerOpen(!triggerOpen)}><i className="bollinger-glyph">⌁</i><strong>{trigger}</strong><em>⌄</em></button>
          {triggerOpen && <div className={`trigger-menu ${TRIGGER_OPTIONS.length > 4 ? "scrollable" : ""}`}>
            {TRIGGER_OPTIONS.map((option) => (
              <button className={trigger === option ? "active" : ""} type="button" onClick={() => chooseTrigger(option)} key={option}>
                <i className={option === "Bollinger Squeeze" ? "bollinger-glyph" : "touch-glyph"}>{option === "Bollinger Squeeze" ? "⌁" : "♧"}</i>
                <span>{option}</span><b>✓</b>
              </button>
            ))}
          </div>}
        </div>
        <label className="dialog-field squeeze-field"><span>Squeeze Value</span><input type="number" defaultValue="1.5" step="0.1" /><small>Enter a numeric value (e.g., 1.5)</small></label>
        <div className="dialog-actions"><button className="cancel-button" type="button" onClick={close}>Cancel</button><button className="purple-button" type="button" onClick={close}>Add Condition</button></div>
      </section>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("create");
  const [marketRequest, setMarketRequest] = useState<MarketNavigationRequest | null>(null);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const applyLocation = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const nextView = requestedView && VIEWS.has(requestedView as View)
      ? requestedView as View
      : "create";
    setView(nextView);
    setMarketRequest(nextView === "markets" ? readMarketRequest(params) : null);
  }, []);

  useEffect(() => {
    applyLocation();
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [applyLocation]);

  const updateLocation = useCallback((
    nextView: View,
    nextMarketRequest: MarketNavigationRequest | null,
    mode: "push" | "replace" = "push",
  ) => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", nextView);
    writeMarketRequest(params, nextView === "markets" ? nextMarketRequest : null);
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
    setView(nextView);
    setMarketRequest(nextView === "markets" ? nextMarketRequest : null);
  }, []);

  const navigate = useCallback((nextView: View) => {
    updateLocation(nextView, null);
  }, [updateLocation]);

  const openTokenInMarkets = useCallback((request: MarketNavigationRequest) => {
    updateLocation("markets", request);
  }, [updateLocation]);

  const updateMarketRequest = useCallback((request: MarketNavigationRequest) => {
    updateLocation("markets", request, "replace");
  }, [updateLocation]);

  return (
    <div className="signal-control-app">
      <div className={`application-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
        <SidebarNavigation activeView={view} open={sidebarOpen} setView={navigate} />
        <div className="application-stage">
          <ApplicationTopbar activeView={view} sidebarOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen((current) => !current)} setView={navigate} />
          <div className="application-view">
            {view === "create" && <CreateView setView={navigate} openCondition={() => setConditionOpen(true)} />}
            {view === "signals" && <SignalsView />}
            {view === "markets" && <Suspense fallback={<div className="page-loading">Loading markets…</div>}><MarketsView request={marketRequest} onRequestChange={updateMarketRequest} onBackToMonitor={() => navigate("asset-tracking")} /></Suspense>}
            {view === "asset-tracking" && <Suspense fallback={<div className="page-loading">Loading asset tracking…</div>}><AssetTrackingView onOpenInMarkets={openTokenInMarkets} /></Suspense>}
            {view === "order-flow" && <OrderFlowView />}
            {view === "notifications" && <NotificationsView />}
            {view === "profile" && <ProfileView setView={navigate} />}
          </div>
        </div>
      </div>
      {conditionOpen && <ConditionModal close={() => setConditionOpen(false)} />}
    </div>
  );
}
