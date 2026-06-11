-- ============================================================
-- PatientTrac Surgery — Patients + Surgical Cases Schema
-- Project: mskormozwekezjmtcylv
-- Run AFTER supabase-migration.sql
-- ============================================================

-- ── 1. cr.patients ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.patients (
  patient_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  mrn         TEXT NOT NULL,              -- Medical Record Number
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  dob         DATE,
  sex         TEXT CHECK (sex IN ('M','F','O')),
  phone       TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, mrn)
);

CREATE INDEX IF NOT EXISTS idx_patients_org    ON cr.patients (org_id);
CREATE INDEX IF NOT EXISTS idx_patients_mrn    ON cr.patients (org_id, mrn);
CREATE INDEX IF NOT EXISTS idx_patients_name   ON cr.patients (org_id, last_name, first_name);

-- ── 2. cr.surgical_cases ─────────────────────────────────────
-- One row per booked OR case. Stage tracks real-time patient location.
CREATE TABLE IF NOT EXISTS cr.surgical_cases (
  case_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  patient_id      UUID NOT NULL REFERENCES cr.patients(patient_id) ON DELETE CASCADE,

  -- Scheduling
  case_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  scheduled_time  TIME,                  -- e.g. '07:30'
  room            TEXT,                  -- e.g. 'OR-1'
  duration_min    INTEGER DEFAULT 90,

  -- Procedure
  procedure       TEXT NOT NULL,
  surgeon         TEXT NOT NULL,
  urgency         TEXT NOT NULL DEFAULT 'routine'
                  CHECK (urgency IN ('routine','urgent','stat')),

  -- Real-time flow stage
  stage           TEXT NOT NULL DEFAULT 'preop'
                  CHECK (stage IN ('preop','inor','pacu','ward','discharge','cancelled')),
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Case status (for OR schedule view)
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','in_progress','completed','delayed','cancelled')),

  -- Completion data
  completed_at    TIMESTAMPTZ,
  total_time_min  INTEGER,
  ebl_ml          INTEGER,
  outcome         TEXT CHECK (outcome IN ('routine','complication_noted','extended')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_org_date  ON cr.surgical_cases (org_id, case_date);
CREATE INDEX IF NOT EXISTS idx_cases_patient   ON cr.surgical_cases (patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_stage     ON cr.surgical_cases (org_id, stage);
CREATE INDEX IF NOT EXISTS idx_cases_status    ON cr.surgical_cases (org_id, status);

-- ── 3. RLS ────────────────────────────────────────────────────
ALTER TABLE cr.patients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr.surgical_cases  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_org_read"   ON cr.patients
  FOR SELECT USING (saas.is_org_member(org_id));
CREATE POLICY "patients_org_insert" ON cr.patients
  FOR INSERT WITH CHECK (saas.is_org_member(org_id));
CREATE POLICY "patients_org_update" ON cr.patients
  FOR UPDATE USING (saas.is_org_member(org_id));

CREATE POLICY "cases_org_read"      ON cr.surgical_cases
  FOR SELECT USING (saas.is_org_member(org_id));
CREATE POLICY "cases_org_insert"    ON cr.surgical_cases
  FOR INSERT WITH CHECK (saas.is_org_member(org_id));
CREATE POLICY "cases_org_update"    ON cr.surgical_cases
  FOR UPDATE USING (saas.is_org_member(org_id));

-- ── 4. Grants ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON cr.patients       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cr.surgical_cases TO authenticated;

-- ── 5. Enable realtime on surgical_cases ─────────────────────
-- Allows SurgeryDashboard to subscribe to live stage changes
ALTER PUBLICATION supabase_realtime ADD TABLE cr.surgical_cases;

-- ── 6. Helper: compute minutes in current stage ───────────────
CREATE OR REPLACE FUNCTION cr.minutes_in_stage(entered_at TIMESTAMPTZ)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(EPOCH FROM (now() - entered_at))::INTEGER / 60;
$$;

-- ── 7. Seed demo data (same patients as the mock UI) ─────────
-- Replace org_id with: 00000000-0000-0000-0000-000000000001
DO $$
DECLARE
  v_org UUID := '00000000-0000-0000-0000-000000000001';
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
  p6 UUID; p7 UUID; p8 UUID; p9 UUID; p10 UUID;
BEGIN
  -- Insert patients (skip if MRN already exists)
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-001', 'Dale',     'Harrington', '1966-03-12', 'M') ON CONFLICT DO NOTHING RETURNING patient_id INTO p1;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-002', 'Simone',   'Vance',      '1990-07-04', 'F') ON CONFLICT DO NOTHING RETURNING patient_id INTO p2;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-003', 'Marcus',   'Fontaine',   '1977-11-22', 'M') ON CONFLICT DO NOTHING RETURNING patient_id INTO p3;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-004', 'Lydia',    'Deschamps',  '1960-05-30', 'F') ON CONFLICT DO NOTHING RETURNING patient_id INTO p4;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-005', 'Benjamin', 'Tran',       '1995-01-18', 'M') ON CONFLICT DO NOTHING RETURNING patient_id INTO p5;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-006', 'Catherine','Osei',       '1973-09-08', 'F') ON CONFLICT DO NOTHING RETURNING patient_id INTO p6;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-007', 'Leon',     'Kowalski',   '1952-02-14', 'M') ON CONFLICT DO NOTHING RETURNING patient_id INTO p7;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-008', 'Marisol',  'Abreu',      '1980-06-25', 'F') ON CONFLICT DO NOTHING RETURNING patient_id INTO p8;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-009', 'Patrick',  'Donnelly',   '1958-12-03', 'M') ON CONFLICT DO NOTHING RETURNING patient_id INTO p9;
  INSERT INTO cr.patients (org_id, mrn, first_name, last_name, dob, sex)
  VALUES (v_org, 'MRN-010', 'Rachel',   'Stern',      '1985-04-19', 'F') ON CONFLICT DO NOTHING RETURNING patient_id INTO p10;

  -- Insert surgical cases (only if patients were newly created)
  IF p1 IS NOT NULL THEN
    INSERT INTO cr.surgical_cases
      (org_id, patient_id, procedure, surgeon, urgency, stage, stage_entered_at, scheduled_time, room, duration_min, status)
    VALUES
      (v_org, p1,  'Laparoscopic Cholecystectomy', 'Dr. Okafor', 'routine', 'preop',    now() - interval '22 min',  '11:30', 'OR-1', 75,  'scheduled'),
      (v_org, p2,  'Appendectomy',                 'Dr. Reyes',  'urgent',  'preop',    now() - interval '8 min',   '13:00', 'OR-2', 60,  'delayed'),
      (v_org, p3,  'Inguinal Hernia Repair',        'Dr. Okafor', 'routine', 'inor',     now() - interval '67 min',  '07:30', 'OR-1', 90,  'in_progress'),
      (v_org, p4,  'Sigmoid Colectomy',             'Dr. Patel',  'routine', 'inor',     now() - interval '142 min', '08:00', 'OR-2', 180, 'in_progress'),
      (v_org, p5,  'Exploratory Laparotomy',        'Dr. Reyes',  'stat',    'inor',     now() - interval '38 min',  '08:30', 'OR-3', 120, 'in_progress'),
      (v_org, p6,  'Lap Cholecystectomy',           'Dr. Patel',  'routine', 'pacu',     now() - interval '55 min',  '06:00', 'OR-2', 72,  'completed'),
      (v_org, p7,  'Right Hemicolectomy',           'Dr. Okafor', 'routine', 'pacu',     now() - interval '28 min',  '05:00', 'OR-1', 88,  'completed'),
      (v_org, p8,  'Gastric Bypass',                'Dr. Patel',  'routine', 'ward',     now() - interval '310 min', '04:00', 'OR-3', 214, 'completed'),
      (v_org, p9,  'Small Bowel Resection',         'Dr. Reyes',  'routine', 'ward',     now() - interval '820 min', '03:00', 'OR-2', 168, 'completed'),
      (v_org, p10, 'Inguinal Hernia Repair',        'Dr. Okafor', 'routine', 'discharge',now() - interval '95 min',  '04:30', 'OR-1', 88,  'completed');
  END IF;
END $$;

-- Verify
SELECT
  sc.case_id,
  p.last_name || ', ' || p.first_name AS patient,
  sc.procedure,
  sc.stage,
  sc.urgency,
  cr.minutes_in_stage(sc.stage_entered_at) AS mins_in_stage,
  sc.room,
  sc.surgeon
FROM cr.surgical_cases sc
JOIN cr.patients p ON p.patient_id = sc.patient_id
ORDER BY sc.stage, sc.stage_entered_at;
