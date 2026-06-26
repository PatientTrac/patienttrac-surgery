# PatientTrac Outpatient Surgery

Surgical documentation and perioperative workflow platform, accessible standalone and from
the connected PatientTrac apps. Developed with input from top physicians and surgeons.

## Stack

This repository is a **React 18 + TypeScript + Vite 5** single-page application — not a static
HTML site. The SPA lives under `src/` and builds to `dist/`.

- **Frontend:** React 18, TypeScript, React Router, Zustand, `@tanstack/react-query`
- **Data / auth:** Supabase (`@supabase/supabase-js`), Postgres 17
- **Documents / canvas:** `@react-pdf/renderer`, `fabric`
- **Serverless:** Netlify Functions (TypeScript, esbuild) under `netlify/functions/`, plus a
  Netlify Edge Function for streaming AI note drafting
- **Build:** `vite build`, then the index is split so the SPA shell is served at `/app.html`
  and the marketing landing page (`public/landing.html`) is served at `/index.html`

### Static specialty pages

The root-level static HTML pages (`ophthalmic-surgery.html`, `orthopedic-eval.html`,
`cardiac-cath.html`, `dermatology.html`, `anesthesia-eval.html`, etc.) and the
`landing-*.html` variants are the per-specialty **marketing / landing surfaces**. They are
self-contained brand pages and are independent of the React app. The canonical deployed
landing page is `public/landing.html` (mirrored at the repo root).

## Database schemas

Clinical conventions used throughout:

- `cr.*` — clinical record tables (integer IDENTITY primary keys)
- `saas.*` — tenancy / routing; `org_id` is a `uuid`, scoped via `saas.current_org_id()`
- `terms.*` — reference / terminology tables

## Anesthesia Vertical (`cr.*` schema)

A normalized anesthesia documentation layer anchored on a single record per case.

**Core**
- `cr.anesthesia_record` — parent, integer PK, **one per case** via `UNIQUE(case_id)` →
  `cr.or_cases`. FKs to patient / encounter / providers / operative note detail, plus an
  optional `anesthesia_consent_id` → `cr.patient_consents`.
- Three 1:1 phase tables, each `UNIQUE(anesthesia_record_id)`:
  - `cr.anesthesia_preop` — airway, ASA, STOP-BANG, RCRI, NPO, OSA, lines, eval
  - `cr.anesthesia_intraop` — technique, induction, maintenance, reversal, Cormack, warming
  - `cr.anesthesia_postop` — Aldrete component scores, PONV, discharge criteria, PACU duration

**Specialty extensions** (flat phase-table pattern, anchored on `anesthesia_record_id`):
`anesthesia_plastics`, `anesthesia_regional_block` (**1:many** — multiple blocks per case),
`anesthesia_cardiac`, `anesthesia_obstetric`, `anesthesia_pediatric`, `anesthesia_ent_airway`,
`anesthesia_bariatric`, `anesthesia_neuro`, `anesthesia_ophthalmic_anes`. All except
`regional_block` are 1:1 (`UNIQUE(anesthesia_record_id)`).

The active extension for a case is selected from `or_cases.procedure_category` via the
`terms.anesthesia_specialty` registry (9 rows). A null or unmapped category uses the generic
core record only — no extension. **Adding a future specialty is one registry row plus one flat
table on the same pattern — no redesign.**

**RLS:** every anesthesia table is org-scoped with `org_id = saas.current_org_id()`.

**Serial intra-op vitals** live in `cr.case_vitals` (the OR live console reads them) and are
**never** duplicated into the anesthesia tables.

**Read convenience:** `cr.anesthesia_full` joins record ⋈ preop ⋈ intraop ⋈ postop.

**Boundaries:** the full H&P is owned by the Pre-Op Evaluation (`preop_module` note), and
consent is owned by the consent subsystem — `anesthesia_preop` duplicates neither.

## Anesthesia Consent

Standalone anesthesia consent is modeled as a `consent_kind` column (`'surgical'` |
`'anesthesia'`, default `'surgical'`) on both `cr.informed_consent_templates` and
`cr.patient_consents`. It reuses the existing consent flow end to end — `consent_tokens`,
`signature_data_url`, status transitions, and the `agreed_to_anesthesia` agreement. When an
anesthesia consent is signed it links back via `cr.anesthesia_record.anesthesia_consent_id`.

UI surfaces: `ConsentTemplates.tsx` (kind selector + anesthesia risk fields),
`ConsentSender.tsx` (kind filter + stamps `consent_kind`), and the patient-facing
`ConsentForm.tsx` (renders anesthesia title/risks and requires the anesthesia agreement).

## Anesthesiology specialty UI

Anesthesiology is presented as a first-class specialty, mirroring the existing surgeon
"medical hero" design language (Orbitron / Exo 2, cyan `#28dfff` / gold `#ffd76a` on
`#050914`):

- A specialty placecard in `public/landing.html`, root `landing.html`, and
  `landing-GOLD-ENHANCED.html`.
- A dedicated `#anesthesiology` hero section in the landing pages.
- A standalone `public/anesthesiology.html` page (shared nav / hero / brand / footer).
- In-app, `AnesthesiaRecord.tsx` shows the case anesthesiologist
  (`or_cases.anesthesiologist_name`) in its header, the way the surgery board attributes a
  surgeon to a case.

**Asset slots (drop-in, with gradient fallback):** `public/assets/anesthesiology.png`
(~230px tall placecard image) and `public/assets/hero-anesthesiology-bg.png` (hero
background). Both are optional — if absent, a navy→teal gradient with a gold-rimmed label is
shown automatically (the placecard `<img>` falls back via `onerror`; the hero falls back via
its base CSS gradient).

## Dashboard navigation

The in-app dashboard exposes the surgical documentation modules:

- Pre-Op Assessment
- Operative Note
- **Anesthesia Record** — backed by the anesthesia vertical above (pre-op eval / intra-op
  record / PACU), with specialty extensions selected by procedure category
- Post-Op Care
- Equipment & Supplies
- Billing Preview

## Shared Clinical Chart (`@patienttrac/clinical-viewer`)

Surgery is wired to the shared `@patienttrac/clinical-viewer` package from GitHub Packages —
the standard 9-section clinical chart used across the PatientTrac fleet (Forge / Revela /
Companion / Mind / Surgery). Surgery is pinned to the **live published registry version**
(currently **0.1.2**), so it tracks whatever the fleet is on without stalling on an unreleased
tag.

- `ClinicalViewerProvider` (given the app's Supabase client) wraps the app in `src/main.tsx`,
  alongside the existing `QueryClientProvider`; `@patienttrac/clinical-viewer/styles.css` is
  imported globally.
- `ClinicalChart` is mounted in the patient drawer of `SurgeryDashboard`, keyed to the **real
  `cr.patients` id** (`or_cases.patient_id`) — never the `case_id`. When a board case has no
  linked patient record the chart toggle is disabled.
- **`react-is` caveat:** on `clinical-viewer` 0.1.2 the package does not inherit `react-is`,
  and recharts 3.x imports it without declaring it, so `react-is` is declared explicitly
  (pinned to React 18's major, `^18.3.1`). 0.1.3 is expected to inherit it.
- Auth: `.npmrc` points `@patienttrac` at `https://npm.pkg.github.com` and reads the token
  from `${NODE_AUTH_TOKEN}` (no token in source). The token must be present in both the
  Codespace and the Netlify build environment.
- Verified with `npm ci && npm run build` (clean install from the lockfile, not a plain
  `npm run build`) — see Jira SCRUM-86.

## Deployment (Netlify + Vite)

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node:** 20 (set in `netlify.toml`)

`netlify.toml` already configures function bundling (esbuild), the streaming edge function,
SPA redirects (app routes → `/app.html`, marketing → `/index.html`), and security headers
(CSP, HSTS, etc.).

**GitHub Packages prerequisite:** installing the private `@patienttrac/clinical-viewer`
package requires the repo `.npmrc` (which points `@patienttrac` at GitHub Packages) plus a
`NODE_AUTH_TOKEN` in both the Codespace and the Netlify build environment.

### Environment variables

Supabase keys for the SPA (`VITE_*`), and for the Netlify functions: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`.

## Cross-app integration

The surgery app participates in the PatientTrac ecosystem via short-lived cross-app session
tokens. Other apps (e.g. PatientTracForge, Revela) route a checked-in encounter here:

```typescript
const { data } = await supabase.rpc('checkin_and_route', {
  p_appointment_id: appointmentId,
  p_target_app: 'surgery',
});
window.location.href = data.url;
// Opens the surgery app with encounter_id / patient_id / token params
```

The app consumes and validates the inbound session token on load.

## Security

- Supabase authentication with session management and TOTP MFA
- Short-lived cross-app session tokens with server-side validation
- Row-level security on clinical tables (`org_id = saas.current_org_id()`)
- Strict CSP and security headers enforced at the edge (`netlify.toml`)

## Support

- **Sales:** sales@patienttrac.com
- **Support:** support@patienttrac.com
- **Legal:** legal@patienttrac.com

---

**PatientTrac Corp © 2026 · HIPAA Compliant**
