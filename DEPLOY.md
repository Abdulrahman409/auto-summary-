# DEPLOY.md — APP-RSK-01 deployment runway

Two phases, deliberately separate:

- **Phase 1 — Independent demo (now).** Public URL, runs entirely on built-in sample
  data (mock mode). No Entra registration, no SharePoint, no sign-in, nothing from the
  LOC tenant. Safe to show leadership.
- **Phase 2 — Production on SharePoint (after leadership approval).** Real identity,
  real lists, real permissions.

---

## Phase 1 — Independent demo on GitHub Pages (no coding)

A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) publishes the built
app automatically on every push. The app detects the placeholder `clientId` in
`src/config.js` and runs in **mock mode** — in-memory sample data, resets on refresh.

**Your URLs once the workflow has run (Actions tab shows a green check):**

| Page | URL |
|---|---|
| Full console (all tabs) | `https://abdulrahman409.github.io/auto-summary-/` |
| FA submit & track | `https://abdulrahman409.github.io/auto-summary-/fa.html` |
| PMO triage | `https://abdulrahman409.github.io/auto-summary-/pmo.html` |
| Executive view | `https://abdulrahman409.github.io/auto-summary-/exec.html` |

If the first run fails at "configure-pages": open **Settings → Pages** on GitHub,
set **Source = GitHub Actions**, then re-run the workflow from the Actions tab.

### Alternative / production-track host: Azure Static Web Apps

Azure SWA also serves the demo AND is the production host later (it sends the
`frame-ancestors` header SharePoint embedding requires; GitHub Pages cannot).
One-time setup in the Azure Portal (~10 min, Free plan):

1. portal.azure.com → **Create a resource → Static Web App**.
2. Subscription + new resource group (e.g. `rg-ac27-risk`); name
   `ac27-risk-console`; **Plan: Free**; region nearest you.
3. **Deployment source: GitHub** → authorize → pick
   `Abdulrahman409/auto-summary-`, branch `main`.
4. **Build presets: Custom** → App location `/` · Api location *(empty)* ·
   Output location `dist`.
5. Review + create. Azure commits its own workflow to the repo and deploys.
   **Our production host (exact):** `https://salmon-ground-096000a10.7.azurestaticapps.net`
   — pages at `/`, `/fa.html`, `/pmo.html`, `/exec.html`, `/setup.html`.
   Every merge to main redeploys, and pull requests get preview URLs
   automatically.

   **Entra SPA redirect URIs (exact, for the app registration):**
   - `https://salmon-ground-096000a10.7.azurestaticapps.net/`
   - `https://salmon-ground-096000a10.7.azurestaticapps.net/index.html`
   - `https://salmon-ground-096000a10.7.azurestaticapps.net/fa.html`
   - `https://salmon-ground-096000a10.7.azurestaticapps.net/pmo.html`
   - `https://salmon-ground-096000a10.7.azurestaticapps.net/exec.html`
   - `https://salmon-ground-096000a10.7.azurestaticapps.net/setup.html`

`staticwebapp.config.json` lives in `public/` so it ships inside `dist/` —
that file carries the SharePoint/Teams embedding headers.

**Know before you share the link:**
- The PMO/Exec gate password is still the default. Fine while the data is fake;
  **rotate it before production** (press F12 in the app, type `pmoHash("NewPassword")`,
  paste the result into `pmoGate.sha256` in `src/config.js`).
- Everything shown is sample data. Nothing is saved — every refresh starts clean.
  That is the point of the demo phase.
- Offline fallback for a meeting room with no Wi-Fi: download
  `dist-demo/index.html` from the repo — it is the entire demo in one
  double-clickable file.

---

## Phase 2 — Production in the LOC environment (approved) — IT once, in this order

The order matters: **hosting first** (it fixes the production URL), **then** the
Entra registration against that URL. IT's total effort is ~45 minutes.

1. **IT — provision the LOC host (~10 min):** Azure Portal (LOC subscription) →
   Create a resource → **Static Web App** → Free plan, nearest region, name e.g.
   `loc-risk-console`, **Deployment source: Other**. Note the generated URL
   (`https://<name>-<hash>.azurestaticapps.net`) and copy the **deployment token**
   (Overview → Manage deployment token).

2. **IT — Entra app registration (~10 min):**
   Microsoft Entra admin center → App registrations → New registration.
   - Name: `AC27 Risk Console`; **single tenant**.
   - Platform **Single-page application (SPA)**; add redirect URIs — the SWA URL
     from step 1 with each of: `/`, `/index.html`, `/fa.html`, `/pmo.html`,
     `/exec.html`, `/setup.html`.
   - API permissions (Microsoft Graph, **delegated** — no application permissions,
     no client secrets): `User.Read`, `Sites.ReadWrite.All`, `Mail.Send` →
     **Grant admin consent** (one consent covers all three).

3. **IT — hand back three values** (deployment token ideally via a secure channel):
   **Directory (tenant) ID** · **Application (client) ID** · **SWA URL + deployment
   token**.

4. **PMO — deploy:** the values go in as GitHub Actions secrets
   (`LOC_TENANT_ID`, `LOC_CLIENT_ID`, `LOC_SWA_DEPLOY_TOKEN`, plus
   `LOC_PMO_SHA256` for the rotated gate password) and the dormant
   `.github/workflows/deploy-loc-azure.yml` workflow is run. Identity is injected
   at build time only in that pipeline — the repo keeps placeholders, so the demo
   hosts stay pure sample-data demos. `staticwebapp.config.json` already sends
   `frame-ancestors *.sharepoint.com`, so SharePoint Embed accepts the app.

5. **Cybersecurity review & approval** — required before production per IT
   direction. The review dossier (SEC-RSK-01) covers architecture, identity,
   data residency, supply chain and residual risks. The deployed-but-unlaunched
   app (no lists yet, no embeds) is available for their inspection; nothing is
   announced or embedded until they approve.

6. **PMO — provision the six lists:** open `setup.html` on the production URL, sign
   in, click **Create the six lists**, then complete the printed finishing touches —
   **item-level security on Risk Intake FIRST** (ReadSecurity=2, WriteSecurity=2).

7. **Permissions** (site owner): FA champions = **Contribute** on *Risk Intake* +
   *FA Validations*, **Read** on *Risk Register*; PMO team = **Edit** everywhere.
   Fill the *FA Champions* list (Title must match the FA dropdown text exactly).

8. **Three embeds:** SharePoint Embed web part → `fa.html` on the FA page,
   `exec.html` on the leadership page, `pmo.html` on the PMO team page.

9. **Run the 10-point smoke test below.**

10. **Import the real register** (~727 rows) via PMO → Health → Import, then announce
   with amnesty framing ("week one is baseline, not judgment").

11. **Name a PMO deputy** — share the rotated gate password and grant list
    permissions.

## 10-point production smoke test

1. Open `fa.html` signed in as a **non-PMO** test user — Submit, Mine, FA view load;
   no PMO tab exists.
2. Submit a risk with both clauses ≥15 chars — it appears in *Risk Intake* with
   Status "Pending triage"; the submitter sees it under **Mine**.
3. As a second non-PMO user, confirm you **cannot** see the first user's intake item
   (item-level security works).
4. Open `pmo.html`, pass the gate — the queue shows the submission with duplicate
   candidates.
5. **Admit** a "Safety & Security" High risk — it lands in *Risk Register* as
   **Escalated** with the breach chip, and a "self-raised" row appears in
   *FA Validations*.
6. **Return** a submission — the submitter receives the auto-email (toast reports
   sent).
7. As a champion, **Flag** a risk with a note — the verdict lands in *FA Validations*
   only; the *Risk Register* row is untouched.
8. Submit with the **Confidential** toggle — queue, SourceRefs, and history show
   "Confidential #id", not the name.
9. Open `exec.html` — KPIs, heat map, and trend render; a KPI snapshot row for the
   current ISO week appears in *Risk KPI Snapshots* (once, even after refresh).
10. Health → **Export register** — the Excel file opens, LOC-branded, three sheets,
    no "Confidential #id" in SourceRefs.

Roll back at any point by removing the embeds; the lists and data are unaffected.
