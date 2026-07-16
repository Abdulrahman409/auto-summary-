# CLAUDE.md — AC27/GC27 Risk Console (APP-RSK-01)

## What this is

A standalone, SharePoint-embeddable risk register operating system for the AFC Asian Cup
Saudi Arabia 2027 (AC27) and the 27th Arabian Gulf Cup (GC27) Local Organising Committee.
It implements **The GATE Method** — Gate · Adjudicate · Tend · Evidence — a Sun–Thu weekly
risk cycle: FAs submit through a gate (Sun), PMO adjudicates every entry (Tue), the register
is tended on phase-aware cadences (Wed), and evidence/KPIs snapshot weekly (Thu).

**Owner:** Abdulrahman Alsharif, Senior PMO Specialist, AC27 LOC. He owns the risk register
for a 3-city, 8-stadium tournament with 53 Functional Areas (FAs). **He is not a coder** —
Claude Code does all implementation. He reviews behavior, not diffs.

The app is feature-complete and QA-verified but **not yet deployed**. See "Deployment
runway" below.

## Non-negotiables (doctrine)

1. **Automate evidence and enforcement, never the verdict.** No runtime AI adjudication,
   scoring suggestions, or auto-triage. PMO judgment is the product; the app is its rails.
2. **Permanently OFF** (do not build even if it seems helpful): leaderboards/gamification,
   dependency/interdependency graphs, comment threads. (Portfolio analytics belongs to a
   future WeTrack handoff — don't fight it.)
3. **FAs never write the Risk Register.** Champion validation verdicts go to the separate
   *FA Validations* list; the app derives validation state (latest verdict per RegisterID,
   no row + open = "Pending validation"). This is a permission-model invariant.
4. **History is append-only and English-only** by design (audit register), even though the
   UI is fully bilingual.
5. **KPI snapshots are programme-wide** (all tournaments), captured once per ISO week,
   deduped server-side. Never fragment the trend series per tournament.
6. **Zero-tolerance rule:** Category "Safety & Security" + Rating High/Critical =
   appetite breach → auto-Escalated on admit, breach chips everywhere, pinned on Exec.
7. **Confidentiality has three honest layers** (see below). Never pretend in-app anonymity
   is real anonymity — SharePoint always records Created By; the app masks, the platform
   audits, the Forms channel (Flow 8) is the only true-anonymous path.
8. **LOC brand:** Barlow (Latin) + IBM Plex Sans Arabic; teal `#065C5D`, gold `#C88214`;
   ratings High `#D97A1A`, Critical `#9C1F1F`. Keep the demo double-clickable,
   single-file, jargon-free.
9. Deliverables carry doc-control IDs (APP-RSK-01, PLT-RSK-01, …). Version bumps in
   README notes when the SharePoint schema changes.

## Architecture

Vite + React, no router — a **multi-page app from one engine**. The root div's
`data-mode` picks the audience tabset:

| Page | Mode | Tabs | Gate |
|---|---|---|---|
| `index.html` | all | Submit · Mine · FA view · PMO · Executive · How | PMO+Exec gated |
| `fa.html` | fa | Submit · Mine · FA view · How | none |
| `pmo.html` | pmo | PMO · How | password |
| `exec.html` | exec | Executive only (no tab strip) | password |
| `setup.html` | — | one-time Graph provisioner | signed-in user's rights |

`src/`:
- **App.jsx** — every component (SubmitView, MineView, FAView, PMO{Queue, RegisterTab,
  ReviewRound, IssuesTab, Health, Participation}, ExecView, TrendChart, SOPView, GateCard).
  All exported at the bottom for the QA harness. TABSETS map at top drives modes.
- **api.js** — `graphApi` (Microsoft Graph v1.0 against the six lists) and `mockApi`
  (demo). **They are mirrors: every feature lands in BOTH.** `pickApi()` chooses mock when
  clientId is the placeholder or `?demo=1`.
- **auth.js** — MSAL: ssoSilent → loginPopup. Scopes: `User.Read`,
  `Sites.ReadWrite.All`, `Mail.Send` (one admin consent covers all three).
- **config.js** — tenant/client/site placeholders; `tournaments` array (AC27 kickoff
  2027-01-07; **GC27 kickoff 2026-09-21 confirmed**); `progKicker`; list names; PMO gate
  sha256 hash (default password `PMO@AC27`; rotate via `pmoHash("new")` in dev console);
  53 official FAs verbatim from FA_Register_V6 (first: "Access and Accreditation
  Management", last: "Workforce Operations") — do not paraphrase FA names.
- **logic.js** — L×I scoring/rating, ISO weeks, `genTitle` (72-char title from event
  clause), phase-aware cadence (`daysToKickoff`, `phaseOf`, `effCadence`: T−90 and T−30
  tighten review cadences; High/Critical → 3 days inside T−90), `sim()` bigram-dice
  similarity — **Arabic-aware** (norm keeps `\u0600-\u06FF`, Arabic stopwords included).
- **excel.js** — ExcelJS 3-sheet LOC-branded register export (Tournament col 2; Residual
  L/I appended cols 26–27; **strips "Confidential #id" from SourceRefs**) and tolerant
  import: fuzzy 2-pass header match (exact alias → substring containment), full Arabic
  header aliases, Arabic status words (مفتوح→Open …), title-from-description fallback,
  IDs kept or assigned, content dedup at `sim ≥ 82`, Tournament defaults to current filter.
- **i18n.js** — `STR.en` / `STR.ar`, 322 keys each, exact parity enforced by QA. MSA
  operational register for Arabic. RTL handled in App via `dir`.
- **setup.jsx** — in-app provisioner: creates the six lists via Graph, safe to re-run,
  prints finishing touches (item-level security on Risk Intake FIRST).

Hosting: `dist/` on any static host. `public/_headers` and `staticwebapp.config.json`
send `frame-ancestors *.sharepoint.com` so SharePoint Embed web parts accept it.

## Data model — six SharePoint lists (names in config.lists)

1. **Risk Intake** — the gate. Fields: Title, Tournament(AC27/GC27), FunctionalArea,
   RaisedBy, EntryType(Risk/Issue), Cause(legacy, unused by form), EventClause,
   Consequence, Category, Scope, Likelihood, Impact, Strategy, Actions, TargetDate,
   Status(Pending triage/Admitted/Merged/Returned/Rejected…), Confidential(Yes/No),
   Decision, MergeInto, TriageNotes, RegisterID. **Item-level security: ReadSecurity=2,
   WriteSecurity=2** (FAs see only their own; PMO with Manage Lists sees all). List
   validation formula: `=AND(LEN([EventClause])>=15,LEN([Consequence])>=15)`.
2. **Risk Register** — PMO-only writes. RegisterID (indexed, unique), Tournament, Title,
   Cause/EventClause/Consequence, LeadFA, ContributingFAs, Category, Scope, L, I,
   (Score/Rating derived client-side), Strategy, Actions, RiskOwner, TargetDate,
   Status(Open/Mitigating/Escalated/Closed), RiskLevel(National/City/Venue),
   RiskWindow(Planning/Readiness/Test events/Tournament time/Legacy), ExternalParties,
   ClosureReason(Mitigated/Overtaken by events/Accepted/Transferred), ResidualL/ResidualI,
   DateRaised, LastReviewed, CadenceDays, SourceRefs, MitigationUpdate, History
   (append-only). FAStatus/FANote exist as legacy columns — the app ignores them.
3. **Issues Log** — IssueID, Tournament, Title, Description, FA, ParentRiskID, IssueOwner,
   RiskLevel, Status(Open/Resolved/Closed), TargetDate (overdue chip when past), SourceRef,
   IssueUpdate (dated).
4. **Risk KPI Snapshots** — Title=ISO week + OpenTotal, CriticalN, HighN, MediumN, LowN,
   ReviewedPct, ForgottenN, EscalatedN, IssuesOpen. Captured on Exec view open (programme-
   wide) or via Health "Capture snapshot now"; dedupe per week.
5. **FA Champions** — Title=FA (must match app dropdown exactly), ChampionName,
   ChampionEmail. Powers weekly reminder emails + participation panel.
6. **FA Validations** — Title=RegisterID, FA, Verdict(Validated/Flagged), ValNote.
   Champions get **Contribute here and on Intake only**. Admit auto-creates a
   self-validation row ("self-raised").

`sharepoint-kit/provision.ps1` (PLT-RSK-01, PnP PowerShell, idempotent) must stay in
**parity with setup.jsx** — any schema change lands in both, plus a README version note.
`sharepoint-kit/flows/FLOWS.md` recipes 1–8 (7 = Monday 09:00 champion reminders,
8 = true-anonymous MS Forms channel).

## Feature inventory (all built and verified)

- **Submit:** statement grammar "There is a risk that [event] — resulting in [impact]"
  (no Cause field); both clauses ≥15 chars; auto-generated title (live preview); required
  Tournament; Confidential toggle (masks the person everywhere: queue, SourceRefs
  "Confidential #id", history; commitment text on the form); live duplicate screen against
  the register; task-wording warning; demo "Load an example".
- **My submissions:** identity-governed by signed-in email (`_authorEmail` vs `me.user`),
  confidential chip, latest mitigation update on linked risks.
- **FA view:** champion picks their FA (localStorage), sees open risks where their FA
  leads/contributes; Validate / Flag(+note) → **FA Validations list only**; pending-only
  toggle; breach/level chips.
- **PMO Queue:** dup candidates ranked, six verdicts (Admit / Merge / Convert-Issue /
  Return / Reject-NotRisk / Reject-Scope), Level select at triage, appetite-breach warning,
  **Return auto-emails the submitter via Graph sendMail** (toast reports sent/not).
- **Register:** search/filter (incl. tournament), expandable rows: breach/level/window/
  residual/validation chips, FANote-style flag notes from valMap, ExternalParties +
  ClosureReason meta, dated mitigation updates, rescore L×I, **PMO classification row**
  (Strategy amend · Level · Window · Residual L×I · ExternalParties — all history-logged),
  **Close requires a reason**, copy deep link (`#R-####`, active only on pmo-capable pages).
- **Guided review round:** worst-first due+forgotten queue, update-and-confirm flow.
- **Issues:** overdue chip vs TargetDate, level select, dated IssueUpdate posts,
  Resolve distinct from Close.
- **Health:** 4 KPIs + substantive-reviews shadow KPI (% updates within cadence), phase
  line, **Participation & compliance** (x/53 FAs submitted this week, silent list toggle,
  pending-validation + FA-flagged counts, "Email weekly reminders" via champions list),
  hygiene sweep, Start review round, styled Excel export, tolerant import, weekly summary
  markdown, Capture snapshot now.
- **Executive:** title shows "— {tournament|All}", tournament chips on rows when All, city
  filter, big numerals, clickable 5×5 heat drill-down, top risks (escalated pinned,
  breach/level chips, mitigation inline), 8-week SVG TrendChart (programme-wide,
  auto-capture on open), movement/attention lines, FA exposure stacked bars, 5-min
  auto-refresh.
- **i18n:** full EN/AR, RTL, persisted; History stays English.
- **Tournament dimension:** AC27/GC27/All header switcher (persisted), per-tournament
  kicker, every view filtered, per-tournament kickoff clocks. **GC27 is at ~T−67 now →
  t90 phase live → High/Critical demand 3-day review cadence on GC27 rows today.**

## Build, test, QA

```bash
npm install
npm run build                                   # multi-entry: index/fa/pmo/exec/setup
npx vite build --config vite.demo.config.js     # single-file demo (index, mock data)
node qa.mjs                                     # the QA harness — run before presenting
```

`qa.mjs`: esbuild-bundles App.jsx to `.qa/app.mjs` (externals: react, react/jsx-runtime,
react-dom, exceljs, xlsx, @azure/msal-browser, js-sha256; `--jsx=automatic`;
window/localStorage/navigator stubbed via defineProperty), then SSR-renders 4 App modes +
16 components × EN/AR = **36 renders**, scanning for throws, `undefined`/`NaN` leaks,
empty output, and EN↔AR key parity. Last run: ALL CLEAN.

Behavioral testing convention: import `mockApi` in a node script and drive real flows
(submit→admit→breach-escalation, validations pending→flagged, issue update/resolve,
closure reasons, Arabic import round-trip, sim dedup). Assert outcomes, print evidence.

**Working conventions learned the hard way:**
- When patching by string-replace, verify anchors against the current file first; report
  misses instead of silently skipping.
- Duplicate JS object keys build fine and fail silently (last wins) — a past bug doubled
  `Tournament:` and let a stale `SourceRefs:` override confidential provenance. Grep for
  duplicate keys after mechanical edits.
- If an audit tool contradicts runtime evidence, suspect the audit (a regex once
  false-reported 125 "missing" i18n keys because keys sit several-per-line).
- Any register schema change touches FOUR places: setup.jsx, provision.ps1, excel.js
  (export columns + import aliases incl. Arabic), and both api mirrors.

## Sibling artifacts (context, not in this repo)

- FRM-RSK-01 v1.0 — FA intake Excel form · SOP-RSK-01 v1.0 — weekly maintenance SOP
  (effective Sun 19 Jul 2026) · PIP-RSK-01 — Python dedup pipeline (thresholds likely=70 /
  possible=45, reason codes B1–B6) · MTH-RSK-01 v1.0 — GATE Method capstone (C-E-C grammar,
  six doctrine principles) · PLT-RSK-01 v2.0 — SharePoint kit (in `../sharepoint-kit` if
  unzipped alongside).
- The original register audit: 1,993 rows → 727 distinct risks (64% duplication). The real
  register import will be ~727 rows.

## Deployment runway (not yet done)

1. Entra app registration — SPA redirect = hosting URL; delegated `User.Read` +
   `Sites.ReadWrite.All` + `Mail.Send`; **one admin consent**.
2. Fill `src/config.js`: tenantId, clientId, siteUrl. Build.
3. Static host (Netlify Drop / Azure SWA). `_headers` already sends
   `frame-ancestors *.sharepoint.com`.
4. Open `setup.html` → "Create the six lists" → do the printed finishing touches,
   **item-level security on Risk Intake first**.
5. Permissions: champions = Contribute on Intake + FA Validations, Read on Register;
   PMO = Edit everywhere. Fill FA Champions rows.
6. Three embeds: `fa.html` on the FA page, `exec.html` on leadership, `pmo.html` for
   the team.
7. 10-point smoke test (in DEPLOY.md), import the real 727-row register, rotate the PMO
   password, announce with amnesty framing ("week one is baseline, not judgment").
8. Name a PMO deputy (gate password + list permissions).

## Open TODOs

- **#12 GC27 venue/scope plan** — `config.js` TODO: scope list is AC27-shaped
  (Riyadh/Jeddah/Al Khobar); make scopes per-tournament when GC27 venues confirm.
- Per-tournament escalation config (mandate tiers differ between AC27 and GC27) — future.
- Unattended weekly KPI capture + reminders = Power Automate recipes 6–7 (documented,
  user-created).

## How to work with the owner

Terse directives arrive; expand them into complete, verified implementations. Deliver
working artifacts with evidence (build output, test results), not promises. No praise
theater. He explicitly welcomes adversarial review — flag design flaws including in his
requests and in prior work, ranked by severity, with concrete fixes. When he says a
feature is needed, find the operationally honest version (e.g., "anonymous" became
three-layer confidentiality with the limits stated). Never leave the app in a broken
state at the end of a session: build + `node qa.mjs` must pass before you stop.
