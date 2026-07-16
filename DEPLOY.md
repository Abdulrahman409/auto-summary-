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

## Phase 2 — Production (after approval) — needs IT admin once

Do these in order. Steps 1 and 5 need your M365 admin; everything else is you.

1. **Entra app registration** (IT admin, ~10 min):
   Microsoft Entra admin center → App registrations → New registration.
   - Name: `AC27 Risk Console`; single tenant.
   - Platform **SPA**; Redirect URI = the production hosting URL.
   - API permissions (Microsoft Graph, **delegated**): `User.Read`,
     `Sites.ReadWrite.All`, `Mail.Send` → **Grant admin consent** (one consent
     covers all three).
   - Note the **Directory (tenant) ID** and **Application (client) ID**.

2. **Fill `src/config.js`:** `tenantId`, `clientId`, `spHostname`, `spSitePath`
   (the SharePoint site that will hold the lists). Rotate the PMO gate hash here too.

3. **Build and host:** `npm install && npm run build`, then put `dist/` on a static
   host that supports response headers — Netlify (drag the `dist` folder onto
   app.netlify.com/drop) or Azure Static Web Apps. `_headers` /
   `staticwebapp.config.json` already send `frame-ancestors *.sharepoint.com` so
   SharePoint Embed will accept the app. (GitHub Pages cannot send those headers —
   it is for the demo phase only.)

4. **Provision the six lists:** open `setup.html` on the production URL, sign in,
   click **Create the six lists**, then complete the printed finishing touches —
   **item-level security on Risk Intake FIRST** (ReadSecurity=2, WriteSecurity=2).

5. **Permissions** (site owner): FA champions = **Contribute** on *Risk Intake* +
   *FA Validations*, **Read** on *Risk Register*; PMO team = **Edit** everywhere.
   Fill the *FA Champions* list (Title must match the FA dropdown text exactly).

6. **Three embeds:** SharePoint Embed web part → `fa.html` on the FA page,
   `exec.html` on the leadership page, `pmo.html` on the PMO team page.

7. **Run the 10-point smoke test below.**

8. **Import the real register** (~727 rows) via PMO → Health → Import, then announce
   with amnesty framing ("week one is baseline, not judgment").

9. **Name a PMO deputy** — share the rotated gate password and grant list permissions.

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
