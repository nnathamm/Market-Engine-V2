"use client";

import { Fragment } from "react";
import { hasPermission, isMasterOwner, type AppAccess, type AppPermission } from "@/lib/access-policy";

export type View =
  | "create"
  | "signals"
  | "signal-library"
  | "master-create"
  | "master-signals"
  | "markets"
  | "asset-tracking"
  | "order-flow"
  | "notifications"
  | "profile";

export const VIEWS = new Set<View>([
  "create",
  "signals",
  "signal-library",
  "master-create",
  "master-signals",
  "markets",
  "asset-tracking",
  "order-flow",
  "notifications",
  "profile",
]);

const VIEW_PERMISSIONS: Record<View, AppPermission> = {
  create: "signals.create",
  signals: "signals.view",
  "signal-library": "signals.view",
  "master-create": "signals.create",
  "master-signals": "signals.view",
  markets: "markets.view",
  "asset-tracking": "asset_tracking.view",
  "order-flow": "order_flow.view",
  notifications: "notifications.view",
  profile: "access.manage",
};

export function canOpenView(access: AppAccess | null | undefined, view: View) {
  return hasPermission(access, VIEW_PERMISSIONS[view]) &&
    (!["master-create", "master-signals", "order-flow"].includes(view) || isMasterOwner(access));
}

type SidebarIconName =
  | "dashboard" | "signals" | "trades" | "markets" | "users" | "alerts" | "integrations"
  | "general" | "trading" | "risk" | "order-flow" | "logs" | "asset-tracking" | "watchlists"
  | "notifications" | "admin" | "create-signal" | "view-signals";

type SidebarSection = {
  heading: string;
  items: ReadonlyArray<readonly [SidebarIconName, string, View]>;
};

const SIDEBAR_SECTIONS: ReadonlyArray<SidebarSection> = [
  { heading: "Build", items: [
    ["create-signal", "Create Signal", "create"],
    ["view-signals", "View/Edit Signals", "signals"],
    ["watchlists", "Signal Library", "signal-library"],
  ] },
  { heading: "Monitor", items: [
    ["markets", "Markets", "markets"],
    ["asset-tracking", "Asset Tracking", "asset-tracking"],
  ] },
  { heading: "Alerts", items: [
    ["notifications", "Notifications", "notifications"],
  ] },
  { heading: "Admin", items: [
    ["order-flow", "Algorithm Design", "order-flow"],
    ["admin", "Manage Access", "profile"],
  ] },
];

const SIDEBAR_ICON_PATHS: Record<SidebarIconName, string> = {
  dashboard: "M3 3h4v4H3zM13 3h4v4h-4zM3 13h4v4H3zM13 13h4v4h-4z",
  signals: "M3 12a9 9 0 0 1 18 0M6 12a6 6 0 0 1 12 0M9 12a3 3 0 0 1 6 0M12 12h.01",
  trades: "M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3",
  markets: "M4 17V9m5 8V5m5 12v-4m5 4V3M2 20h20",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-7a4 4 0 0 1 0 7.75",
  alerts: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  integrations: "M8 12h8M12 8v8M7 3h3v4H7a3 3 0 0 0 0 6h3v4H7a7 7 0 0 1 0-14Zm10 0h-3v4h3a3 3 0 0 0 0 6h-3v4h3a7 7 0 0 1 0-14Z",
  general: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-5 4v4",
  trading: "M5 7h14M5 17h14M5 7l3-3m-3 3 3 3m11 7-3-3m3 3-3 3",
  risk: "M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z",
  "order-flow": "M4 18h4v-6h4V6h4V3h4",
  logs: "M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6",
  "asset-tracking": "M12 5c-5 0-9 7-9 7s4 7 9 7 9-7 9-7-4-7-9-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z",
  watchlists: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3.1 9.6l6.1-.9L12 3Z",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  admin: "M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Zm-3 9 2 2 4-4",
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

export function SidebarNavigation({ activeView, open, setView, access }: { activeView: View; open: boolean; setView: (view: View) => void; access: AppAccess }) {
  const tabIndex = open ? 0 : -1;

  return (
    <aside className="application-sidebar" aria-hidden={!open}>
      <div className="application-sidebar-scroll">
        <button className="application-brand bg-[#060f1c] flex-col" type="button" tabIndex={tabIndex} onClick={() => setView("create")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo preserves the existing fixed sidebar layout. */}
          <img src="/logo.png" alt="Stop Loss" style={{ height: "73px", width: "auto", objectFit: "contain", margin: "0 auto", display: "block", padding: "12px 0" }} />
        </button>

        <nav className="application-sidebar-nav" aria-label="Main navigation">
          {SIDEBAR_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(([, , destination]) => canOpenView(access, destination));
            if (visibleItems.length === 0) return null;
            return (
              <Fragment key={section.heading}>
                <h2>{section.heading}</h2>
                {visibleItems.map(([icon, label, destination]) => (
                  <Fragment key={label}>
                    <button
                      className={activeView === destination ? "active" : ""}
                      type="button"
                      tabIndex={tabIndex}
                      aria-current={activeView === destination ? "page" : undefined}
                      onClick={() => setView(destination)}
                    >
                      <span className="application-sidebar-icon"><SidebarIcon name={icon} /></span><span>{label}</span>
                    </button>
                    {label === "Algorithm Design" && isMasterOwner(access) ? (
                      <div className="application-sidebar-subnav master-signal-subnav" aria-label="Master signal tools">
                        <button type="button" tabIndex={tabIndex} onClick={() => setView("order-flow")}>Order Flow Settings</button>
                        <button className={activeView === "master-create" ? "active" : ""} type="button" tabIndex={tabIndex} aria-current={activeView === "master-create" ? "page" : undefined} onClick={() => setView("master-create")}>Create Master Signal</button>
                        <button className={activeView === "master-signals" ? "active" : ""} type="button" tabIndex={tabIndex} aria-current={activeView === "master-signals" ? "page" : undefined} onClick={() => setView("master-signals")}>View/Edit Master Signals</button>
                      </div>
                    ) : null}
                  </Fragment>
                ))}
              </Fragment>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}