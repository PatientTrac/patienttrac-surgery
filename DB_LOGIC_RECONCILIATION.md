# DB Logic — Current Live Paths (reference)

A consistency reference that complements the existing project notes (the Fable 5
clinical-gap-remediation docs across `patienttrac-surgery` and
`patienttrac-revela`). Purpose: keep everyone pointed at the same live paths so
new work stays consistent. The notes remain the design baseline — this only
records where the shared schema currently lives. Verified read-only against
`mskormozwekezjmtcylv` on 2026-06-14. No database changes were made.

## Canonical table paths (use these)
| Concept | Live path | Notes |
|---|---|---|
| Case record (unified spine) | **`cr.or_cases`** (view `public.or_cases`) | shared by Surgery + OR; `stage` drives the flow board, `case_status` the OR console |
| Patient | **`cr.patient`** (singular) | used by Mind/Forge/etc. |
| Clinical notes | `cr.patient_notes` | Surgery modules write here |
| Operative / post-op / progress notes | `cr.operative_notes`, `cr.postop_plan`, `cr.surgical_prognote` | Revela clinical tables |
| Encounter (cross-app join key) | `cr.encounter` | central FK target |
| Photos / drawings | `cr.surgical_photos`, `cr.surgical_drawings` | |
| AI audit | `cr.ai_audit_log` | see live shape below |
| Behavioral (Mind) catalog | `cr.behavioral_exam_types`, `cr.behavioral_exam_sections` | now carry data-driven MSE/ROS/risk vocab |

The earlier `cr.patients` (plural) + `cr.surgical_cases` concept from
`supabase-cases-migration.sql` is realized in the live DB as `cr.patient` +
`cr.or_cases` — same intent, current names. New work should target the live
paths above.

## Org / RLS helpers available (all SECURITY DEFINER)
`saas.is_org_member(uuid)`, `saas.current_org_id()`,
`saas.user_has_any_module(text[])`, `saas.user_has_or_module()`.
Use these helpers in new policies for consistency (rather than inline
`SELECT … FROM saas.org_members` subqueries).

## `cr.ai_audit_log` — live shape (canonical; PHI-safe)
Columns: `id (bigint)`, `org_id (uuid)`, `function_name`, `encounter_id (bigint)`,
`specialty`, `action`, `provider_id (int)`, `model_used`, `latency_ms`,
`phi_scrubbed (bool)`, `timestamp`, `created_at`. Policies: `ai_audit_insert`
(INSERT), `ai_audit_select` (SELECT). No PHI columns — log `function_name` +
`encounter_id` only. (If any older doc shows a `patient_mrn` column here, prefer
this live shape.)

## Doc hygiene follow-ups (when convenient; no DB change implied)
- Align the `note_type` comment vs CHECK in `supabase-migration.sql`.
- Confirm intended join types for `patient_id`/`encounter_id` (TEXT in
  `cr.patient_notes` vs UUID elsewhere) before new FK work.
- Billing handoff live path is Forge (`patienttrac-scheduling`).
