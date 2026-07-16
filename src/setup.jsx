// ── One-time setup page — creates the four SharePoint lists via Graph ──
// Runs entirely under the signed-in user's own permissions (Edit rights on
// the site are enough to create lists). Replaces provision.ps1 for
// self-deployment. Safe to re-run: existing lists and columns are skipped.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CONFIG, BRAND as C } from "./config.js";
import { initAuth, signIn, getToken } from "./auth.js";
import "./styles.css";

const GRAPH = "https://graph.microsoft.com/v1.0";
const call = async (method, url, body) => {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const t = await res.text(); const e = new Error(`${res.status}: ${t.slice(0, 240)}`); e.status = res.status; throw e; }
  return res.status === 204 ? null : res.json();
};

const txt = (o = {}) => ({ text: { allowMultipleLines: false, ...o } });
const note = (lines = 3) => ({ text: { allowMultipleLines: true, linesForEditing: lines, textType: "plain" } });
const num = () => ({ number: {} });
const date = () => ({ dateTime: { format: "dateOnly" } });
const choice = (...choices) => ({ choice: { allowTextEntry: false, choices, displayAs: "dropDownMenu" } });

const RATING_CH = ["Low", "Medium", "High", "Critical"];
const SCOPE_CH = ["Riyadh", "Jeddah", "Al Khobar", "Multi-city", "Tournament-wide"];
const STRAT_CH = ["Avoid", "Reduce", "Transfer", "Accept", "Escalate", "Resolve (Issue)"];

const LISTS = [
  { name: CONFIG.lists.intake, cols: [
    ["Tournament", choice("AC27", "GC27")], ["FunctionalArea", txt()], ["RaisedBy", txt()], ["EntryType", choice("Risk", "Issue")],
    ["Cause", note(2)], ["EventClause", note(2)], ["Consequence", note(2)],
    ["Category", txt()], ["Scope", choice(...SCOPE_CH)],
    ["Likelihood", num()], ["Impact", num()],
    ["Strategy", choice(...STRAT_CH)], ["Actions", note(2)], ["TargetDate", date()],
    ["Status", choice("Pending triage", "Admitted", "Merged", "Converted to issue", "Returned", "Rejected — not a risk", "Rejected — out of scope")],
    ["Confidential", choice("No", "Yes")],
    ["Decision", txt()], ["MergeInto", txt()], ["TriageNotes", note(2)], ["RegisterID", txt()],
  ]},
  { name: CONFIG.lists.register, cols: [
    ["RegisterID", { indexed: true, enforceUniqueValues: true, ...txt() }],
    ["Tournament", choice("AC27", "GC27")], ["Tournament", choice("AC27", "GC27")],
    ["Cause", note(2)], ["EventClause", note(2)], ["Consequence", note(2)],
    ["LeadFA", txt()], ["ContributingFAs", note(2)], ["Category", txt()], ["Scope", choice(...SCOPE_CH)],
    ["Likelihood", num()], ["Impact", num()], ["Rating", choice(...RATING_CH)],
    ["Strategy", choice(...STRAT_CH)], ["Actions", note(3)], ["RiskOwner", txt()],
    ["TargetDate", date()], ["Status", choice("Open", "Mitigating", "Escalated", "Closed")],
    ["DateRaised", date()], ["LastReviewed", date()], ["CadenceDays", num()],
    ["SourceRefs", note(2)], ["MitigationUpdate", note(3)],
    ["FAStatus", choice("Pending validation", "Validated", "Flagged")], ["FANote", note(2)],
    ["RiskLevel", choice("National", "City", "Venue")],
    ["RiskWindow", choice("Planning", "Readiness", "Test events", "Tournament time", "Legacy")],
    ["ExternalParties", note(2)],
    ["ClosureReason", choice("Mitigated", "Overtaken by events", "Accepted", "Transferred")],
    ["ResidualL", num()], ["ResidualI", num()],
    ["History", note(4)],
  ]},
  { name: CONFIG.lists.issues, cols: [
    ["IssueID", { indexed: true, ...txt() }], ["Tournament", choice("AC27", "GC27")], ["FA", txt()], ["Description", note(3)],
    ["ParentRiskID", txt()], ["IssueOwner", txt()],
    ["Status", choice("Open", "Resolved", "Closed")], ["TargetDate", date()], ["SourceRef", txt()],
    ["RiskLevel", choice("National", "City", "Venue")], ["IssueUpdate", note(3)],
  ]},
  { name: CONFIG.lists.validations, cols: [
    ["FA", txt()], ["Verdict", choice("Validated", "Flagged")], ["ValNote", note(2)],
  ]},
  { name: CONFIG.lists.champions, cols: [
    ["ChampionName", txt()], ["ChampionEmail", txt()],
  ]},
  { name: CONFIG.lists.kpi, cols: [
    ["Tournament", txt()], ["OpenTotal", num()], ["CriticalN", num()], ["HighN", num()], ["MediumN", num()], ["LowN", num()],
    ["ReviewedPct", num()], ["ForgottenN", num()], ["EscalatedN", num()], ["IssuesOpen", num()],
  ]},
];

const FINISH = [
  `CONFIDENTIALITY (do this one first) — Risk Intake → List settings → Advanced settings → Item-level Permissions: Read access = "Read items that were created by the user"; Create and Edit = "Create items and edit items that were created by the user". FAs then cannot see each other's submissions; PMO (Manage Lists rights) still sees everything. This is the platform-level guarantee behind the app's Confidential toggle.`,
  `Risk Register → column "History" → column settings → set "Append changes to existing text" = Yes (turn list versioning ON first: List settings → Versioning settings → Create a version each time = Yes). 30 seconds — makes the audit trail append-only.`,
  `Risk Intake → List settings → Validation settings → paste formula: =AND(LEN([EventClause])>=15,LEN([Consequence])>=15) with message "Event and impact must each be a full clause." — this is the gate at the SharePoint door for anyone bypassing the app.`,
  `FA Champions list: add one row per FA — Title = FA name (exactly as in the app dropdown), ChampionName, ChampionEmail. This powers weekly reminder emails and the participation panel.`,
  `Permissions: FA champions = Contribute on Risk Intake AND on FA Validations (their validation channel — they never write the register itself), Read on Risk Register. PMO Risk = Edit on all four lists. (Site settings → Site permissions, or per-list.)`,
];

function Setup() {
  const [me, setMe] = useState(null);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const add = (m, cls) => setLog((l) => [...l, { m, cls }]);

  const doSignIn = async () => {
    const acct = (await initAuth()) || (await signIn());
    if (acct) setMe(acct.name || acct.username);
  };

  const run = async () => {
    setRunning(true); setLog([]);
    try {
      add(`Resolving site ${CONFIG.spHostname}${CONFIG.spSitePath}…`);
      const site = await call("GET", `${GRAPH}/sites/${CONFIG.spHostname}:${CONFIG.spSitePath}`);
      add(`Site: ${site.displayName}`, "ok");
      const existing = (await call("GET", `${GRAPH}/sites/${site.id}/lists?$top=200`)).value;
      for (const spec of LISTS) {
        let list = existing.find((l) => l.displayName === spec.name);
        if (list) add(`List "${spec.name}" already exists — keeping it.`, "ok");
        else {
          list = await call("POST", `${GRAPH}/sites/${site.id}/lists`, { displayName: spec.name, list: { template: "genericList" } });
          add(`Created list "${spec.name}".`, "ok");
        }
        const cols = (await call("GET", `${GRAPH}/sites/${site.id}/lists/${list.id}/columns?$top=200`)).value.map((c) => c.name);
        let made = 0, kept = 0;
        for (const [name, def] of spec.cols) {
          if (cols.includes(name)) { kept++; continue; }
          try { await call("POST", `${GRAPH}/sites/${site.id}/lists/${list.id}/columns`, { name, ...def }); made++; }
          catch (e) { add(`  ⚠ ${spec.name}.${name}: ${e.message}`, "warn"); }
        }
        add(`  columns: ${made} created, ${kept} already present.`);
      }
      add("All six lists are ready.", "ok");
      setDone(true);
    } catch (e) {
      add(`Stopped: ${e.message}`, "err");
      if (e.status === 403) add("403 = your account lacks rights here. You need Edit (member) on this site, and the app needs admin-consented Sites.ReadWrite.All.", "warn");
    }
    setRunning(false);
  };

  return (
    <div className="shell">
      <div className="hdr"><div className="wrap">
        <div className="kicker">AFC Asian Cup Saudi Arabia 2027 · Local Organising Committee</div>
        <div className="titlerow"><div className="apptitle">ONE-TIME <span style={{ color: C.gold }}>SETUP</span></div></div>
      </div><div className="goldrule" /></div>
      <div className="wrap body">
        <div className="card"><div className="pad">
          <div className="h1">CREATE THE SIX LISTS</div>
          <p className="dim">Creates Risk Intake, Risk Register, Issues Log, Risk KPI Snapshots, FA Champions and FA Validations on
            <b> {CONFIG.spHostname}{CONFIG.spSitePath}</b> under your own permissions. Safe to re-run —
            existing lists and columns are kept, never overwritten.</p>
          {!me ? <button className="btn btn-primary" onClick={doSignIn}>Sign in with Microsoft</button>
            : <div className="row">
                <span className="mini">Signed in: <b>{me}</b></span>
                <button className="btn btn-primary" disabled={running} onClick={run}>{running ? "Working…" : "Create the six lists"}</button>
              </div>}
          <div style={{ marginTop: 14 }}>
            {log.map((l, i) => <div key={i} className="mini" style={{ color: l.cls === "ok" ? C.green : l.cls === "err" ? C.crit : l.cls === "warn" ? C.high : C.dim }}>{l.m}</div>)}
          </div>
          {done && (
            <div style={{ marginTop: 14 }}>
              <div className="slabel">Three 30-second finishing touches (SharePoint UI)</div>
              {FINISH.map((f, i) => <div key={i} className="mini" style={{ marginBottom: 8 }}>{i + 1}. {f}</div>)}
              <div className="warn" style={{ marginTop: 10 }}>Done with these? Open the app itself and run the smoke test. This setup page can be forgotten afterwards.</div>
            </div>
          )}
        </div></div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Setup />);
