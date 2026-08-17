"use client";

import { useState } from "react";

type View = "home" | "create" | "signals";

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
          <h2>What would you like to do?</h2>
          <p>Choose an option below to get started.</p>
        </div>

        <div className="choice-grid">
          <article className="choice-card create-card">
            <div className="choice-icon plus-icon" aria-hidden="true">+</div>
            <h3>Create New Signal</h3>
            <p>Build a new signal with your own<br />rules, time frame, and<br />trigger conditions.</p>
            <button className="primary-choice" type="button" onClick={() => setView("create")}>
              <span aria-hidden="true">＋</span> Create Signal
            </button>
          </article>

          <article className="choice-card view-card">
            <div className="choice-icon list-icon" aria-hidden="true">
              <i /><i /><i />
            </div>
            <h3>View / Edit Signals</h3>
            <p>View, edit, and manage all of your<br />existing signals in one place.</p>
            <button className="secondary-choice" type="button" onClick={() => setView("signals")}>
              View Signals <span aria-hidden="true">→</span>
            </button>
          </article>
        </div>
      </main>
    </div>
  );
}

function SummaryIcon({ children, tone = "purple" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`summary-icon ${tone}`} aria-hidden="true">{children}</span>;
}

function CreateView({ setView, openCondition }: { setView: (view: View) => void; openCondition: () => void }) {
  return (
    <div className="screen inner-screen create-screen">
      <BackButton onClick={() => setView("home")} />

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
              <label className="form-field">
                <span>Time Frame <b>*</b></span>
                <select defaultValue="15m" aria-label="Time Frame">
                  <option value="15m">15 Minutes (15m)</option>
                  <option value="30m">30 Minutes (30m)</option>
                  <option value="1h">1 Hour (1h)</option>
                </select>
              </label>
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
              <label className="form-field">
                <span>Cooldown Period (Optional) <small>?</small></span>
                <select defaultValue="5"><option value="5">5 minutes</option></select>
              </label>
              <label className="form-field">
                <span>Trigger Frequency (Optional) <small>?</small></span>
                <select defaultValue="close"><option value="close">Once per bar close</option></select>
              </label>
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
          <div className="summary-row"><SummaryIcon tone="amber">◴</SummaryIcon><span>Cooldown Period</span><b>5 minutes</b></div>
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
      <BackButton onClick={() => setView("home")} />
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
        <label className="dialog-field"><span>Condition Type</span><button className="select-face" type="button"><i className="bollinger-glyph">⌁</i><strong>Bollinger</strong><em>⌄</em></button></label>
        <div className="dialog-field trigger-field"><span>Trigger</span><button className={`select-face ${triggerOpen ? "selected" : ""}`} type="button" onClick={() => setTriggerOpen(!triggerOpen)}><i className="bollinger-glyph">⌁</i><strong>{trigger}</strong><em>⌄</em></button>
          {triggerOpen && <div className="trigger-menu">
            <button className={trigger === "Bollinger Squeeze" ? "active" : ""} type="button" onClick={() => chooseTrigger("Bollinger Squeeze")}><i className="bollinger-glyph">⌁</i><span>Bollinger Squeeze</span><b>✓</b></button>
            <button className={trigger === "Bollinger Touch" ? "active" : ""} type="button" onClick={() => chooseTrigger("Bollinger Touch")}><i className="touch-glyph">♧</i><span>Bollinger Touch</span><b>✓</b></button>
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
