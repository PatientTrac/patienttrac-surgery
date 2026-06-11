-- ============================================================
-- PatientTrac Surgery — Database Schema Migration
-- Project: mskormozwekezjmtcylv
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 1. Schemas ───────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS saas;
CREATE SCHEMA IF NOT EXISTS cr;

-- ── 2. saas.organizations ────────────────────────────────────
-- NOTE: This table already exists from patienttrac-revela. Actual columns:
--   org_id, org_name, slug (NOT NULL), plan, status, modules (ARRAY),
--   max_facilities, max_providers, created_at, updated_at
-- CREATE TABLE IF NOT EXISTS is safe — skips if already present.
CREATE TABLE IF NOT EXISTS saas.organizations (
  org_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name       TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  plan           TEXT NOT NULL DEFAULT 'starter',
  status         TEXT NOT NULL DEFAULT 'active',
  modules        TEXT[] NOT NULL DEFAULT ARRAY['scheduling'],
  max_facilities INTEGER NOT NULL DEFAULT 1,
  max_providers  INTEGER NOT NULL DEFAULT 5,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. saas.org_members ──────────────────────────────────────
-- Links auth.users → organizations with role + MFA state
CREATE TABLE IF NOT EXISTS saas.org_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES saas.organizations(org_id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'provider'
                   CHECK (role IN ('super_admin', 'admin', 'provider', 'staff', 'viewer')),
  is_active        BOOLEAN NOT NULL DEFAULT false,
  mfa_enabled      BOOLEAN NOT NULL DEFAULT false,
  mfa_secret       TEXT,
  mfa_verified_at  TIMESTAMPTZ,
  display_name     TEXT,
  specialty        TEXT,
  npi              TEXT,
  invited_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON saas.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id  ON saas.org_members (org_id);

-- ── 4. cr.patient_notes ──────────────────────────────────────
-- Stores all structured clinical notes as JSON.
-- note_type values: 'preop_module' | 'operative_note' | 'postop'
-- note_text: TEXT (PreOpModule saves JSON.stringify)
-- content:   JSONB (OperativeModule saves JSONB directly)
CREATE TABLE IF NOT EXISTS cr.patient_notes (
  note_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  patient_id   TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  note_type    TEXT NOT NULL
               CHECK (note_type IN ('preop_module', 'operative_note', 'postop', 'pacu', 'discharge')),
  note_text    TEXT,   -- PreOpModule + PostOpModule store JSON here
  content      JSONB,  -- OperativeModule stores structured JSONB here
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_encounter ON cr.patient_notes (encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_notes_patient   ON cr.patient_notes (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_notes_org       ON cr.patient_notes (org_id);
CREATE INDEX IF NOT EXISTS idx_patient_notes_type      ON cr.patient_notes (note_type);

-- ── 5. Row Level Security ────────────────────────────────────
ALTER TABLE saas.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.org_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr.patient_notes   ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an active member of this org?
CREATE OR REPLACE FUNCTION saas.is_org_member(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM saas.org_members
    WHERE user_id = auth.uid()
      AND org_id  = check_org_id
      AND is_active = true
  );
$$;

-- Organizations: active members can read their own org
CREATE POLICY "org_read_own" ON saas.organizations
  FOR SELECT USING (saas.is_org_member(org_id));

-- Org members: active members can read their org's roster
CREATE POLICY "members_read_own_org" ON saas.org_members
  FOR SELECT USING (saas.is_org_member(org_id));

-- Org members: admins can update (activate users, change roles)
CREATE POLICY "admins_update_members" ON saas.org_members
  FOR UPDATE USING (
    saas.is_org_member(org_id) AND
    EXISTS (
      SELECT 1 FROM saas.org_members
      WHERE user_id = auth.uid()
        AND org_id  = saas.org_members.org_id
        AND role IN ('admin', 'super_admin')
        AND is_active = true
    )
  );

-- Patient notes: org-scoped read
CREATE POLICY "notes_read_own_org" ON cr.patient_notes
  FOR SELECT USING (saas.is_org_member(org_id));

-- Patient notes: org-scoped insert
CREATE POLICY "notes_insert_own_org" ON cr.patient_notes
  FOR INSERT WITH CHECK (saas.is_org_member(org_id));

-- Patient notes: org-scoped update
CREATE POLICY "notes_update_own_org" ON cr.patient_notes
  FOR UPDATE USING (saas.is_org_member(org_id));

-- ── 6. Grant API access to schemas ──────────────────────────
GRANT USAGE ON SCHEMA saas TO anon, authenticated;
GRANT USAGE ON SCHEMA cr   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON saas.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON saas.org_members   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cr.patient_notes   TO authenticated;

-- ── 7. Seed: create your first org ───────────────────────────
-- saas.organizations already exists from patienttrac-revela.
-- slug is required NOT NULL. modules is a text array.
INSERT INTO saas.organizations (org_name, slug, plan, modules, max_providers)
VALUES ('PatientTrac Surgery', 'patienttrac-surgery', 'professional', ARRAY['scheduling','surgery'], 20)
ON CONFLICT DO NOTHING;

-- ── View the created org_id ───────────────────────────────────
SELECT org_id, org_name FROM saas.organizations;

-- ── 8. After creating a user in Auth, link them as admin ─────
-- Replace the UUIDs below with real values from Auth → Users
-- and the org_id from the SELECT above, then uncomment + run:
--
-- INSERT INTO saas.org_members (org_id, user_id, role, is_active, display_name)
-- VALUES (
--   '<org_id from step 7>',
--   '<user_id from Supabase Auth → Users>',
--   'admin',
--   true,
--   'Your Name'
-- );
