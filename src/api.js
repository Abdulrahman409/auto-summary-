// ── Data layer: Microsoft Graph against the PLT-RSK-01 lists ─────────────
// Field internal names match provision.ps1 exactly. Calculated columns
// (Score, Rating, NextReviewDue) are read-only — never written.
// Verdict writes set intake Status in the same PATCH that records the
// Decision, so PLT-RSK-01 Flow 2 (trigger condition: Status = 'Pending
// triage') skips items the app has already executed. Both paths coexist.
import { CONFIG } from "./config.js";
import { getToken, account } from "./auth.js";
import { rating, pad4, todayISO, isoWeek, CADENCE, sim } from "./logic.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
let siteId = null;

const call = async (method, url, body) => {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`${res.status}: ${t.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
};

const site = async () => {
  if (siteId) return siteId;
  const d = await call("GET", `${GRAPH}/sites/${CONFIG.spHostname}:${CONFIG.spSitePath}`);
  siteId = d.id;
  return siteId;
};

const listAll = async (listName, select) => {
  const sid = await site();
  let url = `${GRAPH}/sites/${sid}/lists/${encodeURIComponent(listName)}/items?expand=fields${select ? `(select=${select})` : ""}&$top=200`;
  const out = [];
  while (url) {
    const d = await call("GET", url);
    for (const it of d.value) out.push({ _id: it.id, _created: it.createdDateTime, _author: it.createdBy?.user?.displayName || "", _authorEmail: it.createdBy?.user?.email || "", ...it.fields });
    url = d["@odata.nextLink"] || null;
  }
  return out;
};
const createItem = async (listName, fields) => {
  const sid = await site();
  return call("POST", `${GRAPH}/sites/${sid}/lists/${encodeURIComponent(listName)}/items`, { fields });
};
const patchItem = async (listName, id, fields) => {
  const sid = await site();
  return call("PATCH", `${GRAPH}/sites/${sid}/lists/${encodeURIComponent(listName)}/items/${id}/fields`, fields);
};
const dt = (iso) => (iso ? `${String(iso).slice(0, 10)}T00:00:00Z` : null);
const sendMailRaw = (to, subject, content) => call("POST", `${GRAPH}/me/sendMail`,
  { message: { subject, body: { contentType: "Text", content }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true });

// ── Public API (mirrored by mock.js) ──────────────────────────────────
const derive = (r) => {
  const L = +r.Likelihood, I = +r.Impact;
  if (L >= 1 && I >= 1) { r.Score = L * I; r.Rating = rating(L * I); }
  return r;
};

export const graphApi = {
  demo: false,
  whoami: () => ({ name: account()?.name || "", user: account()?.username || "" }),

  listIntake: async () => (await listAll(CONFIG.lists.intake)).map(derive),
  listRegister: async () => (await listAll(CONFIG.lists.register)).map(derive),
  listIssues: () => listAll(CONFIG.lists.issues),
  listChampions: async () => { try { return await listAll(CONFIG.lists.champions); } catch { return []; } },
  listValidations: async () => { try { return await listAll(CONFIG.lists.validations); } catch { return []; } },
  addValidation: async ({ RegisterID, FA, Verdict, Note }) =>
    createItem(CONFIG.lists.validations, { Title: RegisterID, FA, Verdict, ValNote: Note || "" }),
  issueUpdate: async (row, text) =>
    patchItem(CONFIG.lists.issues, row._id, { IssueUpdate: `${todayISO()}: ${text}` }),
  resolveIssue: async (row) => patchItem(CONFIG.lists.issues, row._id, { Status: "Resolved" }),
  sendMail: (to, subject, body) => sendMailRaw(to, subject, body),

  createIntake: async (f) =>
    createItem(CONFIG.lists.intake, {
      Title: f.title, FunctionalArea: f.fa, RaisedBy: f.by, EntryType: f.type,
      Cause: f.cause, EventClause: f.event, Consequence: f.consequence,
      Category: f.cat, Scope: f.scope, Likelihood: +f.L, Impact: +f.I,
      Strategy: f.strat, Actions: f.actions, TargetDate: dt(f.target),
      Status: "Pending triage", Confidential: f.conf ? "Yes" : "No", Tournament: f.tour || "AC27", Tournament: f.tour || "AC27",
    }),

  decide: async (sub, decision, { target = "", note = "", level = "" }, registerRows) => {
    const today = todayISO();
    const conf = sub.Confidential === "Yes";
    if (decision === "Admit") {
      const mx = registerRows.reduce((m, r) => Math.max(m, +String(r.RegisterID || "").replace(/\D/g, "") || 0), 0);
      const rid = `R-${pad4(mx + 1)}`;
      const rate = rating(sub.Likelihood * sub.Impact);
      const breach = sub.Category === "Safety & Security" && (rate === "High" || rate === "Critical");
      await createItem(CONFIG.lists.register, {
        Title: sub.Title, RegisterID: rid, Cause: sub.Cause, EventClause: sub.EventClause,
        Consequence: sub.Consequence, LeadFA: sub.FunctionalArea, ContributingFAs: "",
        Category: sub.Category, Scope: sub.Scope, Likelihood: sub.Likelihood, Impact: sub.Impact,
        Strategy: sub.Strategy, Actions: sub.Actions,
        RiskOwner: `${sub.FunctionalArea} — FA Risk Champion`, TargetDate: sub.TargetDate,
        Status: breach ? "Escalated" : "Open", RiskLevel: level, Tournament: sub.Tournament || "AC27", DateRaised: dt(today), LastReviewed: dt(today),
        CadenceDays: CADENCE[rate], SourceRefs: conf ? `Confidential #${sub._id}` : `${sub.FunctionalArea} #${sub._id}`,
        History: (conf ? `${today}: admitted from confidential submission (intake #${sub._id})` : `${today}: admitted from ${sub.FunctionalArea} (intake #${sub._id})`)
          + (breach ? `\n${today}: auto-escalated — zero-tolerance category (Safety & Security ${rate})` : ""),
      });
      try { await createItem(CONFIG.lists.validations, { Title: rid, FA: sub.FunctionalArea, Verdict: "Validated", ValNote: "self-raised" }); } catch {}
      await patchItem(CONFIG.lists.intake, sub._id, { Decision: "Admit", Status: "Admitted", RegisterID: rid, TriageNotes: note });
      return { riskId: rid, breach };
    }
    if (decision === "Merge") {
      const t = registerRows.find((r) => r.RegisterID === target);
      if (!t) throw new Error(`Merge target ${target || "—"} not found in register`);
      const contrib = String(t.ContributingFAs || "");
      await patchItem(CONFIG.lists.register, t._id, {
        ContributingFAs: sub.FunctionalArea !== t.LeadFA && !contrib.includes(sub.FunctionalArea)
          ? [contrib, sub.FunctionalArea].filter(Boolean).join("; ") : contrib,
        SourceRefs: [t.SourceRefs, conf ? `Confidential #${sub._id}` : `${sub.FunctionalArea} #${sub._id}`].filter(Boolean).join("; "),
        LastReviewed: dt(todayISO()),
        History: conf ? `merged confidential intake #${sub._id}` : `merged intake #${sub._id} from ${sub.FunctionalArea}`,
      });
      await patchItem(CONFIG.lists.intake, sub._id, { Decision: "Merge", Status: "Merged", MergeInto: target, RegisterID: target, TriageNotes: note });
      return { target };
    }
    if (decision === "Convert-Issue") {
      const issues = await listAll(CONFIG.lists.issues, "IssueID");
      const mx = issues.reduce((m, r) => Math.max(m, +String(r.IssueID || "").replace(/\D/g, "") || 0), 0);
      const iid = `I-${pad4(mx + 1)}`;
      await createItem(CONFIG.lists.issues, {
        Title: sub.Title, IssueID: iid, FA: sub.FunctionalArea,
        Description: `${sub.Cause} ${sub.EventClause} ${sub.Consequence}`,
        ParentRiskID: target, IssueOwner: `${sub.FunctionalArea} — FA Risk Champion`, RiskLevel: level, Tournament: sub.Tournament || "AC27",
        Status: "Open", TargetDate: sub.TargetDate, SourceRef: `intake #${sub._id}`,
      });
      await patchItem(CONFIG.lists.intake, sub._id, { Decision: "Convert to issue", Status: "Converted to issue", RegisterID: iid, TriageNotes: note });
      return { issueId: iid };
    }
    // Return / Reject-*
    const map = { Return: "Returned", "Reject-NotRisk": "Rejected — not a risk", "Reject-Scope": "Rejected — out of scope" };
    await patchItem(CONFIG.lists.intake, sub._id, {
      Decision: decision === "Return" ? "Return" : decision === "Reject-NotRisk" ? "Reject — not a risk" : "Reject — out of scope",
      Status: map[decision], TriageNotes: note,
    });
    if (decision === "Return") {
      let mailed = false;
      if (sub._authorEmail) {
        try {
          await sendMailRaw(sub._authorEmail, `AC27 Risk Intake — returned: ${sub.Title}`,
            `Your submission "${sub.Title}" was returned by PMO triage.\n\nReason: ${note || "(see triage note in the app)"}\n\nPlease correct and resubmit before Sunday 12:00. Open "My submissions" in the Risk Console for details.`);
          mailed = true;
        } catch { /* Mail.Send not consented or mailbox unavailable */ }
      }
      return { mailed };
    }
    return {};
  },


  importRegister: async (rows, existing, onProgress) => {
    const have = new Set((existing || []).map((r) => String(r.RegisterID || "").toUpperCase()));
    let mx = 0;
    for (const r of [...(existing || []), ...rows]) { const n = +String(r.RegisterID || "").replace(/\D/g, ""); if (n > mx) mx = n; }
    let imported = 0, skippedDup = 0, skippedSim = 0, failed = 0, assignedIds = 0;
    const seenTxt = (existing || []).map((r) => `${r.Title} ${r.EventClause || ""}`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; onProgress && onProgress(i + 1, rows.length);
      if (!r.RegisterID) { r.RegisterID = `R-${pad4(++mx)}`; assignedIds++; }
      if (have.has(String(r.RegisterID).toUpperCase())) { skippedDup++; continue; }
      const rowTxt = `${r.Title} ${r.EventClause || ""}`;
      if (seenTxt.some((x) => sim(rowTxt, x) >= 82)) { skippedSim++; continue; }
      try {
        await createItem(CONFIG.lists.register, {
          Title: r.Title, RegisterID: r.RegisterID, Cause: r.Cause, EventClause: r.EventClause,
          Consequence: r.Consequence, LeadFA: r.LeadFA, ContributingFAs: r.ContributingFAs,
          Category: r.Category, Scope: r.Scope,
          ...(r.Likelihood && r.Impact ? { Likelihood: r.Likelihood, Impact: r.Impact } : {}),
          Strategy: r.Strategy, Actions: r.Actions, RiskOwner: r.RiskOwner,
          TargetDate: dt(r.TargetDate), Status: r.Status,
          DateRaised: dt(r.DateRaised || todayISO()), LastReviewed: dt(r.LastReviewed || todayISO()),
          CadenceDays: r.CadenceDays, SourceRefs: r.SourceRefs,
          MitigationUpdate: r.MitigationUpdate, Tournament: r.Tournament || "AC27",
          History: (r.History ? r.History + "\n" : "") + `${todayISO()}: imported from Excel migration`,
        });
        have.add(String(r.RegisterID).toUpperCase()); seenTxt.push(rowTxt); imported++;
      } catch { failed++; }
    }
    return { imported, skippedDup, skippedSim, failed, assignedIds };
  },

  touchRisk: async (row, patch, histLine) =>
    patchItem(CONFIG.lists.register, row._id, { ...patch, LastReviewed: dt(todayISO()), History: `${todayISO()}: ${histLine}` }),
  listKpi: async () => { try { return await listAll(CONFIG.lists.kpi); } catch { return []; } },
  captureKpi: async (week, fields) => {
    try {
      const cur = await listAll(CONFIG.lists.kpi);
      if (cur.find((k) => k.Title === week && (k.Tournament || "All") === (fields.Tournament || "All"))) return;
      await createItem(CONFIG.lists.kpi, { Title: week, ...fields });
    } catch { /* read-only viewers can't capture — fine */ }
  },
  closeIssue: async (row) => patchItem(CONFIG.lists.issues, row._id, { Status: "Closed" }),
  setIssueLevel: async (row, level) => patchItem(CONFIG.lists.issues, row._id, { RiskLevel: level }),
};

// ── Demo mock (?demo=1): same surface, in-memory data, no auth ────────
const D = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); };
const mkReg = () => [
  ["R-0726","Ingress crowd density exceeding safe thresholds at Jeddah opening fixtures","Security","Jeddah",4,5,"Open",2,"Because gate throughput modelling assumes staggered arrivals,","there is a risk that compressed arrival peaks exceed safe crowd density at ingress points,","resulting in crowd safety exposure and delayed kick-off readiness."],
  ["R-0727","Accreditation system outage on match day","Access and Accreditation Management","Tournament-wide",3,4,"Escalated",25,"Because the accreditation platform has a single hosting region,","there is a risk that a regional outage disables badge validation on a match day,","resulting in manual fallback at all gates and workforce entry delays."],
  ["R-0728","Metro service reduction on Riyadh double-header days","Transport","Riyadh",3,4,"Open",0,"Because Riyadh Metro maintenance windows overlap the match calendar,","there is a risk that reduced metro frequency cannot absorb double-header spectator volumes,","resulting in station overcrowding and delayed stadium egress."],
  ["R-0729","Volunteer attrition ahead of tournament window","Volunteer Management","Tournament-wide",3,3,"Open",15,"Because volunteer commitment is unpaid and training spans months,","there is a risk that attrition exceeds the planned buffer before venue assignment,","resulting in workforce gaps at spectator-facing positions."],
  ["R-0730","Sponsor activation clashes with venue clean-site rules","Commercial Operations","Multi-city",2,2,"Open",5,"Because activation plans are drafted before final venue overlay,","there is a risk that approved activations conflict with clean-site zones,","resulting in late rework and sponsor dissatisfaction."],
  ["R-0732","Heat exposure at open-air park-and-ride waiting areas","Transport","Multi-city",4,3,"Open",0,"Because park-and-ride hubs have uncovered queuing zones and afternoon kick-offs,","there is a risk that spectators queue in direct heat beyond safe exposure limits,","resulting in heat-related medical incidents and negative spectator experience."],
].map(([RegisterID,Title,LeadFA,Scope,L,I,Status,age,Cause,EventClause,Consequence], i) => ({
  _id: String(100 + i), RegisterID, Title, Cause, EventClause, Consequence, LeadFA, ContributingFAs: "",
  Category: "Operational Delivery", Scope, Likelihood: L, Impact: I, Score: L * I, Rating: rating(L * I),
  Strategy: "Reduce", Actions: "Per response plan.", RiskOwner: `${LeadFA} — FA Risk Champion`,
  TargetDate: D(-60), Status, DateRaised: D(40), LastReviewed: D(age),
  CadenceDays: CADENCE[rating(L * I)], SourceRefs: `${LeadFA} legacy`, History: `${todayISO()}: demo seed`,
})).map((r) => {
  r.RiskLevel = { "R-0726": "Venue", "R-0727": "National", "R-0728": "City", "R-0732": "City", "R-0729": "National", "R-0730": "Venue" }[r.RegisterID] || "";
  r.Tournament = "AC27";
  r.Tournament = "AC27";
  if (r.RegisterID === "R-0728") r.MitigationUpdate = "2026-07-12: RCRC reviewing maintenance-freeze request; decision expected end of month.";
  if (r.RegisterID === "R-0726") { r.MitigationUpdate = "2026-07-13: arrival-curve remodel complete; joint police tabletop booked for 24 Jul.";
    r.ResidualL = 3; r.ResidualI = 4; r.RiskWindow = "Tournament time"; r.ExternalParties = "Police command; stadium operator"; }
  if (r.RegisterID === "R-0728") { r.RiskWindow = "Tournament time"; r.ExternalParties = "Riyadh Metro operator (RCRC)"; }
  return r;
});
const mkGC = () => [
  { _id: "g1", RegisterID: "R-0733", Title: "GC27 venue overlay procurement compressed against fixture confirmation",
    Cause: "", EventClause: "there is a risk that overlay procurement lead times exceed the window between fixture confirmation and bump-in,",
    Consequence: "resulting in incomplete venue overlay at the first GC27 match.", LeadFA: "Commercial Operations",
    ContributingFAs: "", Category: "Venue & Infrastructure", Scope: "Multi-city", Likelihood: 4, Impact: 4,
    Score: 16, Rating: "Critical", Strategy: "Reduce", Actions: "Pre-position framework contracts; early-order long-lead items.",
    RiskOwner: "Commercial Operations — FA Risk Champion", TargetDate: D(-30), Status: "Open",
    RiskLevel: "National", Tournament: "GC27", DateRaised: D(20), LastReviewed: D(2), CadenceDays: 7,
    SourceRefs: "GC27 planning", History: `${todayISO()}: demo seed`, MitigationUpdate: "" },
  { _id: "g2", RegisterID: "R-0734", Title: "GC27 security workforce competing with AC27 readiness activities",
    Cause: "", EventClause: "there is a risk that security staffing for GC27 draws down the same pool required for AC27 test events,",
    Consequence: "resulting in coverage gaps across both programmes.", LeadFA: "Security",
    ContributingFAs: "Workforce Operations", Category: "Safety & Security", Scope: "Tournament-wide", Likelihood: 3, Impact: 4,
    Score: 12, Rating: "High", Strategy: "Escalate", Actions: "Joint workforce plan across tournaments.",
    RiskOwner: "Security — FA Risk Champion", TargetDate: D(-10), Status: "Open",
    RiskLevel: "National", Tournament: "GC27", DateRaised: D(15), LastReviewed: D(1), CadenceDays: 7,
    SourceRefs: "GC27 planning", History: `${todayISO()}: demo seed`, MitigationUpdate: "", RiskWindow: "Readiness" },
];
const mkIntake = () => [
  { _id: "d1", _created: new Date().toISOString(), _author: "Demo user", _authorEmail: "demo@ac27.local",
    Title: "Riyadh metro capacity shortfall on derby match days", FunctionalArea: "Transport",
    RaisedBy: "A. Al-Qahtani — FA Risk Champion", EntryType: "Risk",
    Cause: "Because metro line maintenance is scheduled inside the tournament window,",
    EventClause: "there is a risk that reduced metro frequency cannot absorb derby-day spectator volumes,",
    Consequence: "resulting in platform overcrowding and delayed stadium egress.",
    Category: "Transport & Mobility", Scope: "Riyadh", Likelihood: 3, Impact: 4, Score: 12, Rating: "High",
    Strategy: "Reduce", Actions: "Coordinate maintenance freeze; surge bus bridge on derby days.",
    TargetDate: "2026-10-15", Status: "Pending triage" },
  { _id: "d2", _created: new Date().toISOString(), _author: "Demo user", _authorEmail: "demo@ac27.local",
    Title: "Additional TETRA radios for venue teams", FunctionalArea: "IT and Digital Services",
    EntryType: "Risk",
    Cause: "Because current radio stock covers existing venues only,",
    EventClause: "we need to procure 40 additional TETRA radios before September,",
    Consequence: "resulting in radio coverage gaps if not procured.",
    Category: "Technology & Systems", Scope: "Multi-city", Likelihood: 2, Impact: 3, Score: 6, Rating: "Medium",
    Strategy: "Reduce", Actions: "Raise procurement request for 40 units.",
    TargetDate: "2026-09-01", Status: "Pending triage", Confidential: "Yes", RaisedBy: "Confidential" },
];
let demoState = null;
const mkKpi = () => {
  const base = [[4,0,2,1,1,72,2],[4,0,2,1,1,75,2],[5,1,2,1,1,70,2],[5,1,2,1,1,78,1],
                [6,1,3,1,1,80,1],[6,1,3,1,1,83,1],[7,1,3,2,1,79,2],[6,1,3,1,1,83,1]];
  const now = new Date(); const out = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(d.getDate() - 7 * (8 - i));
    const [o, c, h, m, l, p, f] = base[i];
    out.push({ Title: isoWeek(d), Tournament: "AC27", OpenTotal: o, CriticalN: c, HighN: h, MediumN: m, LowN: l,
               ReviewedPct: p, ForgottenN: f, EscalatedN: i > 4 ? 1 : 0, IssuesOpen: 1 });
  }
  return out;
};
const demoInit = () => { if (!demoState) demoState = { reg: [...mkReg(), ...mkGC()], intake: mkIntake(), issues: [{ _id: "i1", IssueID: "I-0001",
    Title: "Venue Wi-Fi backbone outage at Riyadh test event", FA: "Venue IT",
    Description: "Primary fibre route cut during precinct works; Wi-Fi and accreditation scanning down three hours during the test event.",
    ParentRiskID: "R-0727", IssueOwner: "ICT & Technology — FA Risk Champion", RiskLevel: "Venue", Status: "Open",
    IssueUpdate: "2026-07-14: temporary microwave link live; fibre re-route quote received.",
    TargetDate: "2026-07-25", SourceRef: "test event report" }], kpi: mkKpi(),
    vals: [
      { _id: "v1", _created: D(3), _author: "Demo user", Title: "R-0726", FA: "Security", Verdict: "Validated", ValNote: "" },
      { _id: "v2", _created: D(3), _author: "Demo user", Title: "R-0727", FA: "Access and Accreditation Management", Verdict: "Validated", ValNote: "" },
      { _id: "v3", _created: D(2), _author: "Demo user", Title: "R-0730", FA: "Commercial Operations", Verdict: "Validated", ValNote: "" },
      { _id: "v4", _created: D(1), _author: "Demo user", Title: "R-0734", FA: "Security", Verdict: "Validated", ValNote: "" },
    ],
    champs: [{ FA: "Transport", ChampionName: "Demo Champion", ChampionEmail: "transport.champion@ac27.local" },
             { FA: "Security", ChampionName: "Demo Champion", ChampionEmail: "security.champion@ac27.local" },
             { FA: "Volunteer Management", ChampionName: "Demo Champion", ChampionEmail: "vol.champion@ac27.local" }], n: 3 }; return demoState; };

export const mockApi = {
  demo: true,
  whoami: () => ({ name: "Demo user", user: "demo@ac27.local" }),
  listIntake: async () => demoInit().intake.slice(),
  listRegister: async () => demoInit().reg.slice(),
  listIssues: async () => demoInit().issues.slice(),
  listChampions: async () => demoInit().champs.slice(),
  listValidations: async () => demoInit().vals.slice(),
  addValidation: async ({ RegisterID, FA, Verdict, Note }) => {
    const st = demoInit();
    st.vals.push({ _id: `v${st.n++}`, _created: new Date().toISOString(),
      _author: "Demo user", Title: RegisterID, FA, Verdict, ValNote: Note || "" });
  },
  issueUpdate: async (row, text) => {
    demoInit().issues.find((x) => x._id === row._id).IssueUpdate = `${todayISO()}: ${text}`;
  },
  resolveIssue: async (row) => { demoInit().issues.find((x) => x._id === row._id).Status = "Resolved"; },
  sendMail: async () => ({ simulated: true }),
  createIntake: async (f) => {
    const s = demoInit();
    s.intake.push({ _id: `d${s.n++}`, _created: new Date().toISOString(), _author: "Demo user",
      Title: f.title, FunctionalArea: f.fa, RaisedBy: f.by, EntryType: f.type, Cause: f.cause,
      EventClause: f.event, Consequence: f.consequence, Category: f.cat, Scope: f.scope,
      Likelihood: +f.L, Impact: +f.I, Score: +f.L * +f.I, Rating: rating(+f.L * +f.I),
      Strategy: f.strat, Actions: f.actions, TargetDate: f.target, Status: "Pending triage", Confidential: f.conf ? "Yes" : "No", Tournament: f.tour || "AC27" });
  },
  decide: async (sub, decision, { target = "", note = "", level = "" }, registerRows) => {
    const s = demoInit(); const it = s.intake.find((x) => x._id === sub._id); const today = todayISO();
    const conf = sub.Confidential === "Yes";
    if (decision === "Admit") {
      const mx = s.reg.reduce((m, r) => Math.max(m, +r.RegisterID.replace(/\D/g, "")), 0);
      const rid = `R-${pad4(mx + 1)}`; const rate = rating(sub.Likelihood * sub.Impact);
      const breach = sub.Category === "Safety & Security" && (rate === "High" || rate === "Critical");
      s.reg.push({ ...sub, _id: `r${s.n++}`, RegisterID: rid, LeadFA: sub.FunctionalArea, ContributingFAs: "", RiskLevel: level, Tournament: sub.Tournament || "AC27",
        RaisedBy: conf ? "Confidential" : sub.RaisedBy, SourceRefs: conf ? `Confidential #${sub._id}` : `${sub.FunctionalArea} #${sub._id}`,
        Score: sub.Likelihood * sub.Impact, Rating: rate, RiskOwner: `${sub.FunctionalArea} — FA Risk Champion`,
        Status: breach ? "Escalated" : "Open", DateRaised: today, LastReviewed: today, CadenceDays: CADENCE[rate],
        History: `${today}: admitted (demo)` + (breach ? ` · auto-escalated — zero-tolerance category` : "") });
      s.vals.push({ _id: `v${s.n++}`, _created: new Date().toISOString(), _author: "Demo user", Title: rid, FA: sub.FunctionalArea, Verdict: "Validated", ValNote: "self-raised" });
      Object.assign(it, { Status: "Admitted", RegisterID: rid, TriageNotes: note }); return { riskId: rid, breach };
    }
    if (decision === "Merge") {
      const t = s.reg.find((r) => r.RegisterID === target);
      if (!t) throw new Error(`Merge target ${target || "—"} not found`);
      t.LastReviewed = today; t.SourceRefs += `; ${sub.FunctionalArea} #${sub._id}`;
      Object.assign(it, { Status: "Merged", RegisterID: target, TriageNotes: note }); return { target };
    }
    if (decision === "Convert-Issue") {
      const iid = `I-${pad4(s.issues.length + 1)}`;
      s.issues.push({ _id: `i${s.n++}`, IssueID: iid, Title: sub.Title, FA: sub.FunctionalArea, RiskLevel: level, Tournament: sub.Tournament || "AC27",
        Description: `${sub.Cause} ${sub.EventClause} ${sub.Consequence}`, ParentRiskID: target,
        IssueOwner: `${sub.FunctionalArea} — FA Risk Champion`, Status: "Open", TargetDate: sub.TargetDate, SourceRef: sub._id });
      Object.assign(it, { Status: "Converted to issue", RegisterID: iid, TriageNotes: note }); return { issueId: iid };
    }
    const map = { Return: "Returned", "Reject-NotRisk": "Rejected — not a risk", "Reject-Scope": "Rejected — out of scope" };
    Object.assign(it, { Status: map[decision], TriageNotes: note });
    return decision === "Return" ? { mailed: "demo" } : {};
  },

  importRegister: async (rows, existing, onProgress) => {
    const st = demoInit();
    const have = new Set(st.reg.map((r) => String(r.RegisterID).toUpperCase()));
    let mx = 0;
    for (const r of [...st.reg, ...rows]) { const n = +String(r.RegisterID || "").replace(/\D/g, ""); if (n > mx) mx = n; }
    let imported = 0, skippedDup = 0, skippedSim = 0, assignedIds = 0;
    const seenTxt = st.reg.map((r) => `${r.Title} ${r.EventClause || ""}`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; onProgress && onProgress(i + 1, rows.length);
      if (!r.RegisterID) { r.RegisterID = `R-${pad4(++mx)}`; assignedIds++; }
      if (have.has(String(r.RegisterID).toUpperCase())) { skippedDup++; continue; }
      const rowTxt = `${r.Title} ${r.EventClause || ""}`;
      if (seenTxt.some((x) => sim(rowTxt, x) >= 82)) { skippedSim++; continue; }
      st.reg.push({ ...r, _id: `m${st.n++}`,
        LastReviewed: r.LastReviewed || todayISO(), DateRaised: r.DateRaised || todayISO(),
        History: (r.History ? r.History + "\n" : "") + `${todayISO()}: imported from Excel migration` });
      have.add(String(r.RegisterID).toUpperCase()); seenTxt.push(rowTxt); imported++;
    }
    return { imported, skippedDup, skippedSim, failed: 0, assignedIds };
  },

  touchRisk: async (row, patch, histLine) => {
    const r = demoInit().reg.find((x) => x._id === row._id);
    Object.assign(r, patch, { LastReviewed: todayISO(), History: (r.History || "") + `\n${todayISO()}: ${histLine}` });
    if (patch.Likelihood && patch.Impact) {
      r.Score = patch.Likelihood * patch.Impact; r.Rating = rating(r.Score); r.CadenceDays = CADENCE[r.Rating];
    }
  },
  listKpi: async () => demoInit().kpi.slice(),
  captureKpi: async (week, fields) => {
    const st = demoInit();
    if (!st.kpi.find((k) => k.Title === week && (k.Tournament || "All") === (fields.Tournament || "All"))) st.kpi.push({ Title: week, ...fields });
  },
  closeIssue: async (row) => { demoInit().issues.find((x) => x._id === row._id).Status = "Closed"; },
  setIssueLevel: async (row, level) => { demoInit().issues.find((x) => x._id === row._id).RiskLevel = level; },
};

export const pickApi = () =>
  new URLSearchParams(window.location.search).get("demo") === "1" || CONFIG.clientId === "YOUR-CLIENT-ID"
    ? mockApi : graphApi;
