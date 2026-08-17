"use client";

import { useEffect, useId, useRef, useState } from "react";

type View = "home" | "create" | "signals";
type DropdownOption = { value: string; label: string };

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

const FREQUENCY_OPTIONS: DropdownOption[] = [
  { value: "close", label: "Once per bar close" },
];

const TRIGGER_OPTIONS = ["Bollinger Squeeze", "Bollinger Touch"];

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
      <span className="signal-mark-ring ring-one" />
      <span className="signal-mark-ring ring-two" />
      <span className="signal-mark-dot" />
      <span className="signal-mark-stem" />
      <span className="signal-mark-base" />
    </span>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back-button" type="button" onClick={onClick}>
      <span aria-hidden="true">←</span> Back
    </button>
  );
}

function InnerNavigation({ activeView, setView }: { activeView: "create" | "signals"; setView: (view: View) => void }) {
  return (
    <div className="inner-topbar">
      <BackButton onClick={() => setView("home")} />
      <nav className="view-navigation" aria-label="Signal Control pages">
        <button className={activeView === "create" ? "active" : ""} type="button" aria-current={activeView === "create" ? "page" : undefined} onClick={() => setView("create")}>
          <span aria-hidden="true">＋</span> Create Signal
        </button>
        <button className={activeView === "signals" ? "active" : ""} type="button" aria-current={activeView === "signals" ? "page" : undefined} onClick={() => setView("signals")}>
          <span aria-hidden="true">☷</span> View Signals
        </button>
      </nav>
    </div>
  );
}

function HomeView({ setView }: { setView: (view: View) => void }) {
  return (
    <div className="screen home-screen">
      <header className="home-header">
        <SignalMark />
        <div>
          <h1>Signal Control</h1>
          <p>Create and manage your trading signals</p>
        </div>
      </header>

      <main className="home-main">
        <div className="home-intro">
          <h2>Welcome to Signal Control</h2>
          <p>Choose where you want to start.</p>
        </div>

        <div className="choice-grid">
          <button className="choice-card create-card" type="button" aria-label="Create a new signal" onClick={() => setView("create")}>
            <span className="choice-icon plus-icon" aria-hidden="true">+</span>
            <span className="choice-title">Create New Signal</span>
            <span className="choice-copy">Build a new signal with your own<br />rules, time frame, and<br />trigger conditions.</span>
            <span className="choice-action primary-choice">
              <span aria-hidden="true">＋</span> Create Signal
            </span>
          </button>

          <button className="choice-card view-card" type="button" aria-label="View and edit signals" onClick={() => setView("signals")}>
            <span className="choice-icon list-icon" aria-hidden="true">
              <i /><i /><i />
            </span>
            <span className="choice-title">View / Edit Signals</span>
            <span className="choice-copy">View, edit, and manage all of your<br />existing signals in one place.</span>
            <span className="choice-action secondary-choice">
              View Signals <span aria-hidden="true">→</span>
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}

function SummaryIcon({ children, tone = "purple" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`summary-icon ${tone}`} aria-hidden="true">{children}</span>;
}

function CreateView({ setView, openCondition }: { setView: (view: View) => void; openCondition: () => void }) {
  const [timeFrame, setTimeFrame] = useState("15m");
  const [cooldown, setCooldown] = useState("custom:0:0:5");
  const [frequency, setFrequency] = useState("close");

  return (
    <div className="screen inner-screen create-screen">
      <InnerNavigation activeView="create" setView={setView} />

      <header className="inner-header">
        <div className="inner-title">
          <SignalMark />
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
            <p>Configure how often this signal can trigger and other optional behaviors.</p>
            <div className="settings-fields">
              <CooldownChooser value={cooldown} onChange={setCooldown} />
              <UiDropdown label={<>Trigger Frequency (Optional) <small>?</small></>} value={frequency} options={FREQUENCY_OPTIONS} onChange={setFrequency} />
              <label className="notification-field">
                <span>Notifications (Optional) <small>?</small></span>
                <span className="toggle-row"><input type="checkbox" defaultChecked /> <em>Enable notifications when triggered</em></span>
              </label>
            </div>
            <div className="info-strip"><span>ⓘ</span> Cooldown prevents repeated signals. Frequency controls how often the conditions are evaluated.</div>
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
          <div className="summary-row"><SummaryIcon tone="cyan">≋</SummaryIcon><span>Trigger Frequency</span><b>Once per bar close</b></div>
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

function SignalsView({ setView }: { setView: (view: View) => void }) {
  return (
    <div className="screen inner-screen signals-screen">
      <InnerNavigation activeView="signals" setView={setView} />
      <header className="list-header">
        <SignalMark />
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
  const [view, setView] = useState<View>("home");
  const [conditionOpen, setConditionOpen] = useState(false);

  return (
    <main className="signal-control-app">
      {view === "home" && <HomeView setView={setView} />}
      {view === "create" && <CreateView setView={setView} openCondition={() => setConditionOpen(true)} />}
      {view === "signals" && <SignalsView setView={setView} />}
      {conditionOpen && <ConditionModal close={() => setConditionOpen(false)} />}
    </main>
  );
}
