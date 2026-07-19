# APP-RSK-01 v1.0 (standalone) — AC27 Risk Intake & Triage
Static React SPA · Microsoft identity (MSAL) · data = the PLT-RSK-01 SharePoint lists via
Microsoft Graph. **No Claude dependency at runtime.** Supersedes the v0.9 pilot; component
of MTH-RSK-01 (The GATE Method), Tier 3.

## What it is
- **Submit** — the gate as UI: live cause–event–consequence assembly, task-wording nudge,
  duplicate detection against the register as the FA types, all fields enforced.
- **My submissions** — self-serve status (Pending / Admitted R-#### / Merged / Returned + reason).
- **PMO triage** — queue with dup candidates and one-tap verdicts that write the register
  (next R-#### assigned, merge credits contributors, history appended), register review with
  zombie/due flags, issues log, health KPIs + delta export.
- Access control is real: users are their M365 identity; writes succeed or fail by the lists'
  own permissions (FA = read register, PMO = edit). The app has no passwords of its own.
- **Coexists with PLT-RSK-01 Flow 2** by design: the app records Decision and sets Status in
  one write, so the flow's trigger condition (Status = 'Pending triage') skips app-executed
  items. Either path can run a given week.

## Try it in 60 seconds (no setup)
Serve `dist/` anywhere (or `npm run dev`) and open with **`?demo=1`** — in-memory sample
data, no sign-in, nothing stored. This is the version to show leadership before IT touches anything.

## Production deployment
**1 · Entra app registration** (IT or self-service depending on tenant policy — 10 min)
- Entra ID → App registrations → New: name `AC27 Risk Console`, single tenant.
- Platform: **Single-page application**; Redirect URI = your host origin
  (e.g. `https://<app>.azurestaticapps.net/`). Add both with/without trailing slash.
- API permissions → Microsoft Graph → **Delegated**: `User.Read`, `Sites.ReadWrite.All`
  → **Grant admin consent** (the one true IT ask — a two-line email).
- Copy Tenant ID + Client ID into `src/config.js`, set `spHostname` / `spSitePath`,
  then `npm install && npm run build`.

**2 · Host `dist/` on any HTTPS static host**
- Azure Static Web Apps (free tier) is the natural home in an M365 org —
  `staticwebapp.config.json` is included and already sends
  `Content-Security-Policy: frame-ancestors https://*.sharepoint.com` so SharePoint may frame it.
- IIS / nginx / GitHub Pages work equally; replicate that header (and SPA fallback) there.

**3 · Embed in SharePoint**
- Site Settings → **HTML Field Security** → allow iframes from your host domain.
- Page → **Embed** web part → `<iframe src="https://<your-host>/" width="100%" height="900"></iframe>`.
- Sign-in inside the iframe: the app tries silent SSO first and falls back to a **popup**
  (never redirect — iframe-safe). If the tenant blocks third-party cookies, users click
  Sign in once per session; the popup completes it.

## Field mapping
Internal names match `provision.ps1` exactly (FunctionalArea, EventClause, Consequence,
Likelihood, Impact, Strategy, Actions, TargetDate, Status, Decision, MergeInto, TriageNotes,
RegisterID · Register: LeadFA, ContributingFAs, CadenceDays, LastReviewed, SourceRefs,
History…). Calculated columns (Score, Rating, NextReviewDue) are computed by SharePoint and
never written by the app. History is append-only: each PATCH adds a line, versioning keeps the trail.

## Audience pages (multi-page)
The build produces four pages from one engine — embed each where its audience lives:
- `index.html` — everything (admin / your own use)
- `fa.html` — FA champions: Submit, My submissions, FA view, How it works (no PMO/Exec)
- `pmo.html` — the PMO console (+ How it works), behind the team password
- `exec.html` — the Executive dashboard only, behind the team password, no tab chrome
Embed pattern per SharePoint page: `<iframe src="https://YOUR-HOST/fa.html" …>` etc.
`setup.html` is the one-time provisioner.

## PMO gate
The **PMO triage** tab is gated by a team password. Only the SHA-256 hash lives in
`src/config.js` (`pmoGate`) — no plaintext in the code or bundle. Default password:
`PMO@AC27` — change it before rollout: open the app, press F12, type
`pmoHash("YourNewPassword")`, paste the result into `pmoGate.sha256`, rebuild.
Honest scope: this gates the door (UI), not the data — in production, writes are
enforced by SharePoint permissions regardless; the gate stops casual entry. Unlock
lasts for the browser session. Set `pmoGate.enabled: false` to remove it.

## FA list
The Functional Area dropdown carries the official 53-FA register (FA_Register_V6,
AC27 LOC). To update it later, edit `FAS` in `src/config.js`.

## Notes & limits
- Next-ID assignment is max+1 (indexed, unique RegisterID enforces integrity); single
  adjudicator at weekly volume — fine. Two people admitting simultaneously would collide on
  the unique index and one retry succeeds.
- The dup screen is the same lexical model as PIP-RSK-01 (≥70 near-verbatim, 45–69 judgment
  band). Semantic triage assistance stays a PMO-side practice, not a runtime dependency.
- KPI dashboarding beyond the Health tab: Power BI on the lists, later, optional.

## Schema version notes

- **v1.1** — Risk Intake gains `ProposedEscalation` (choice: Chief level ·
  Leadership level), the FA's escalation proposal after internal assessment
  (leadership governance requirement #3). Surfaced as evidence in the PMO
  queue; the decision remains with adjudication. **provision.ps1 (PLT-RSK-01,
  sibling kit) must add the same column before provisioning with it.**
