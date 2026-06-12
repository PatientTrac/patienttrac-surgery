# PatientTrac Clinical Review — Session Primer
## For use with Fable 5 / Fable 6 on next PatientTrac EMR project

---

## What This Is

This is a briefing for running a Fable 5/6 clinical gap analysis on a PatientTrac EMR project. The same methodology was previously applied to `patienttrac-surgery` and produced a 4-phase remediation covering 136 clinical gaps. This document tells a fresh session exactly what to do, how to do it, and what standards to measure against.

---

## Platform Overview (applies to all PatientTrac projects)

**Stack:**
- Static HTML + Vanilla JS, deployed on Netlify
- Supabase PostgreSQL backend, `cr` schema
- Cross-app JWT authentication via `validate_cross_app_token` RPC
- Netlify Functions (Node.js CommonJS) for server-side logic
- AI: `claude-fable-5` for clinical reasoning, `claude-haiku-4-5-20251001` for fast tasks
- No build step — `inject-env.sh` substitutes `window.__PT_ANON_KEY` at Netlify build time

**HIPAA constraints (non-negotiable across all projects):**
- NEVER call Claude API from browser — all AI calls through Netlify Functions only
- BAA with Anthropic required before PHI flows to Claude API
- `ANTHROPIC_API_KEY` is server-side env var only, never in HTML
- PHI scrubbing before AI calls: strip `patient_name`, `dob`, `ssn`, `mrn`, `address`, `phone`, `email`, `insurance_id`
- Audit log all AI actions to `cr.ai_audit_log` (encounter_id + function_name only, no clinical content)

**Key files (look for these in every project):**
- `netlify.toml` — build config, security headers, function timeout, edge functions
- `inject-env.sh` — env var substitution at build time
- `dashboard.html` / `app.html` — main navigation, links to all clinical modules
- `netlify/functions/*.js` — server-side API endpoints
- `ai-client.js` — browser AI wrapper (may not exist yet — needs to be created if absent)

---

## The Review Methodology (4-Phase Framework)

### Phase 0 — Orientation (do this first, ~30 min)

1. Read `dashboard.html` and `app.html` to inventory ALL linked forms/modules
2. Read the Supabase schema: run `list_tables` via MCP to understand `cr.*` tables
3. Identify the clinical specialties covered and their documentation standards
4. Check for existing `netlify/functions/` — what AI infrastructure exists?
5. Read `netlify.toml` — security headers present? Function timeout set?

**Output:** A full module inventory with columns: form name, specialty, Supabase table, has AI panel, has data-dictation, known issues.

---

### Phase 1 — Data Integrity Audit (highest priority)

Look for these exact bug patterns that appeared in `patienttrac-surgery` and likely recur:

| Bug Pattern | How to Find | Fix |
|---|---|---|
| **Hardcoded `false`** in save payload | `grep "false" saveFunction` | Replace with `?.checked ?? null` |
| **Math.random()** in clinical data | `grep "Math.random"` | Remove or replace with real Supabase query |
| **Wrong selector** for laterality (eye, limb, side) | Read save function payload | Separate UI-selection var from save-payload var |
| **Incomplete save** — fields visible in UI not in payload | Compare UI fields vs insert object | Add missing fields |
| **Missing encounter_id** in insert | `grep "insert\["` | Add `encounter_id: encounterId` to every payload |
| **Hardcoded Supabase anon key** `eyJ...` | `grep "eyJhbGci"` | Replace with `window.__PT_ANON_KEY \|\| ''` |

**Score this phase:** For each form, mark pass/fail on: encounter_id present, no hardcoded false, no mock data, laterality correct, all UI fields saved.

---

### Phase 2 — Clinical Completeness Audit

Score each form against its specialty documentation standard. The clinical standards that matter:

**Universal (every clinical form):**
- Joint Commission RC.02.01.01 — authenticated provider signature / attestation on all notes
- CMS CoP 42 CFR 482.24 — medical record completion requirements
- CMS CoP 42 CFR 482.51(b)(2) — informed consent documented before any procedure
- HIPAA §164.312(b) — audit controls for all ePHI access

**Surgical / Perioperative:**
- SCIP (Surgical Care Improvement Project) — VTE prophylaxis, SSI prevention, antibiotic timing
- Caprini VTE risk score — must be in pre-op and post-op surgical notes
- Universal Protocol (Joint Commission) — timeout, site marking, count verification
- RCRI (Revised Cardiac Risk Index) — required in anesthesia and pre-op surgical notes
- STOP-BANG — OSA screening, required in anesthesia evaluation

**Cardiology:**
- ACC/AHA guidelines — HEART score, GRACE score for ACS risk stratification
- ACC/AHA statin/antiplatelet documentation

**Endoscopy / GI:**
- GIQuIC quality metrics — adenoma detection rate, withdrawal time, cecal intubation
- Polyp classification: Paris, Kudo, NICE — required for screening colonoscopy
- Boston Bowel Prep Scale

**Ophthalmology:**
- LOCS III lens opacity grading
- IOL biometry constants (A-constant, ACD)
- Refraction surprise documentation

**Orthopedics:**
- AAOS/ACCP VTE guidelines
- PROMs (Patient Reported Outcomes) — KOOS, HOOS, PROMIS required for value-based care

**Dermatology:**
- AJCC melanoma staging (T/N/M with Breslow depth, Clark level, ulceration)
- Mohs micrographic surgery layer/stage documentation

**For each form, score:**
- Clinical scoring tools present (0/1 per relevant tool)
- Consent documented (0/1)
- Provider identity captured (0/1)
- VTE risk assessed if surgical (0/1)
- Guideline-required fields present (0-5 scale)

---

### Phase 3 — AI Infrastructure

If `ai-client.js` does not exist, create it from the `patienttrac-surgery` version — it is reusable across all PatientTrac projects with no changes to the core.

The 7 standard Netlify Functions needed in every project:
1. `ai-note-review.js` — quality/completeness review (claude-fable-5)
2. `ai-draft-note.js` — generative note drafting (claude-fable-5)
3. `ai-drug-interactions.js` — drug-drug/drug-allergy CDS (claude-fable-5)
4. `ai-risk-score.js` — perioperative risk enhancement (claude-fable-5)
5. `ai-icd-cpt.js` — ICD-10/CPT code suggestions (claude-fable-5)
6. `ai-dictation-cleanup.js` — dictation cleanup (claude-haiku-4-5-20251001)
7. `ai-registry-extract.js` — registry data extraction (claude-fable-5)

The Edge Function for streaming:
- `netlify/edge-functions/ai-draft-note-stream.js` — Deno, SSE streaming

**For each clinical form, add:**
- `<script src="/ai-client.js"></script>` before `</body>`
- `data-dictation="true"` on all clinical free-text textareas
- AI Assist panel (slide-up overlay) with tabs appropriate to the specialty

**AI panel tab patterns by specialty:**
- Surgical/procedural: Review Note + Draft Section + Suggest Codes + Registry Extract
- Pre-op/evaluation: Drug Interactions + Suggest Codes + Risk Assessment
- Anesthesia: Drug Interactions + Anesthesia Risk
- Post-op/follow-up: Drug Interactions + Review Note

---

### Phase 4 — Hardening & Infrastructure

Run these checks and fix what's missing:

**Security:**
```bash
grep -r "eyJhbGci" *.html          # hardcoded Supabase keys
grep "api.anthropic.com" netlify.toml  # should NOT be in CSP connect-src
grep "Math.random\|generateMock" *.html  # mock data
grep "innerHTML\s*=" ai-client.js  # XSS vectors — all AI strings must use esc()
```

**netlify.toml must include:**
```toml
[functions]
  directory = "netlify/functions"
  timeout = 30          # default 10s is too short for Fable 5

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=()"
    Content-Security-Policy = """
      default-src 'self';
      script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
      connect-src 'self' https://*.supabase.co;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src 'self' data: blob: https://*.supabase.co;
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self';
    """
```

**Dead links (check these always exist):**
- `privacy.html`, `terms.html`, `hipaa.html` — linked from landing page footers
- `.env.example` — documents `SUPABASE_ANON_KEY`, `SUPABASE_URL`, `ANTHROPIC_API_KEY`

**Supabase:**
```sql
-- Run once per project if not present
create table if not exists cr.ai_audit_log (
  id              bigserial       primary key,
  function_name   text            not null,
  encounter_id    bigint,
  specialty       text,
  action          text            not null,
  org_id          uuid,
  provider_id     integer,
  timestamp       timestamptz     not null default now(),
  created_at      timestamptz     not null default now()
);
create index on cr.ai_audit_log (encounter_id);
create index on cr.ai_audit_log (timestamp desc);
alter table cr.ai_audit_log enable row level security;
create policy "insert_ai_audit" on cr.ai_audit_log for insert to authenticated, anon with check (true);
create policy "select_ai_audit" on cr.ai_audit_log for select to authenticated using (true);
```

---

## Reusable Assets From patienttrac-surgery

These files can be copied directly into the next project with no modification:

| File | Purpose |
|---|---|
| `ai-client.js` | Browser AI wrapper — copy verbatim |
| `allergy-medication-component.js` | Shared allergy/medication UI component |
| `caprini-vte-component.js` | Caprini VTE scoring widget |
| `netlify/functions/ai-*.js` | All 7 Netlify Functions — copy verbatim |
| `netlify/edge-functions/ai-draft-note-stream.js` | SSE streaming edge function |
| `privacy.html`, `terms.html`, `hipaa.html` | Legal stub pages |
| `.env.example` | Environment variable documentation |

---

## Scoring Rubric (reproduce this at project end)

| Dimension | Max Score | What to Measure |
|---|---|---|
| Clinical completeness | 100 | Required fields, scoring tools, specialty standards |
| AI features | 100 | Panels present, dictation cleanup, code suggest |
| Data integrity | 100 | No hardcoded values, all fields saved, encounter_id present |
| Security / HIPAA | 100 | CSP, no PHI in AI calls, audit log, provider attestation |
| Deployment readiness | 100 | Timeout, env vars documented, legal pages, no 404s |

**patienttrac-surgery baseline:** Clinical 47/100, AI 8/100 before remediation.
**patienttrac-surgery after:** Clinical ~82/100, AI ~91/100 (estimated).

---

## How to Start the Next Session

Paste this as the opening message in a new Claude session:

```
I need you to run a Fable 5 clinical gap analysis on [PROJECT NAME].
Working directory: /workspaces/[project-name]

This is a PatientTrac EMR project — same stack as patienttrac-surgery 
(Netlify static HTML/JS, Supabase cr schema, cross-app JWT auth).

Follow the 4-phase methodology in CLINICAL_REVIEW_PRIMER.md from patienttrac-surgery.
The file is at /workspaces/patienttrac-surgery/CLINICAL_REVIEW_PRIMER.md — read it first.

Start with Phase 0 orientation: inventory all forms from dashboard.html,
list the Supabase tables via MCP, and produce a gap analysis table.
Then propose the 3 highest-priority Phase 1 fixes and wait for approval before coding.

HIPAA constraints: never call Claude API from browser. All AI calls through 
Netlify Functions only. ANTHROPIC_API_KEY server-side only.
```

---

## Notes From patienttrac-surgery Remediation

**What took the most time:**
- Reading and understanding each form's save function before editing (unavoidable)
- Supabase migration FK errors — always run `list_tables` before writing migrations, use nullable FK columns to avoid schema drift fragility

**What was faster than expected:**
- AI panel HTML follows a very consistent pattern — once you have one, the others are copy-adapt
- `data-dictation` attribute rollout is a grep + one-line-per-form change

**Decisions that required human input:**
- Whether explicit attestation checkbox or implicit (JWT-based) is acceptable
- Whether consent belongs in post-procedure forms or only pre-op
- Which legacy/orphaned files to delete vs. keep
- Whether SSE streaming vs. 30s synchronous timeout is acceptable UX

**Watch for in new projects:**
- `dermatology.html` equivalent — orphaned files with hardcoded keys not linked from nav
- `billing.html` / `equipment.html` equivalent — active but possibly duplicating OR-app functionality
- The `validate_cross_app_token` RPC name may differ slightly between projects — check before wiring AI functions
```
