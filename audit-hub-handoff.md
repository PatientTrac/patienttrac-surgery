# PatientTrac Audit Hub — Implementation Context

## Project Overview

**New Supabase Project:** `lazieeewetgxixdvfmmq` (separate from main platform)  
**Purpose:** Centralized HIPAA audit logging for all PatientTrac surgery applications  
**GitHub Repo:** PatientTrac/patienttrac-audit-hub (to be created)  
**Deployment:** Netlify (site to be created)

---

## Applications to Track

### 1. PatientTracSurg (patienttracsurg.com)
- **Type:** Static HTML documentation site
- **Forms:** 14 surgical documentation forms
- **Current State:** Production, actively used
- **Audit Needs:**
  - Form access tracking (who viewed which form, when)
  - Download tracking
  - Patient identifiable form submissions (if any)

### 2. PatientTracOR (patienttracsurgery.com)
- **Type:** React 18 + TypeScript + Vite
- **Repo:** PatientTrac/patienttrac-or
- **Local Path:** ~/patienttrac-or
- **Modules Built Today:**
  1. Equipment Catalog (or_equipment_catalog)
  2. Surgical Supplies Inventory (surgical_supplies_inventory)
  3. Medication Inventory (medication_inventory)
  4. DEA Controlled Substance Log (dea_controlled_substance_log)
  5. Preference Cards (coming in v2)
  6. Live Case Console (coming in v2)
- **Database:** Uses main Supabase (`mskormozwekezjmtcylv`)
- **Audit Needs:**
  - DEA controlled substance access (CRITICAL — federal requirement)
  - Equipment/supply access with patient identifiers
  - Medication dispensing logs
  - Live case viewer access (PHI exposure)

### 3. Revela (patienttrac-revela.com)
- **Type:** React 18 + TypeScript + Vite
- **Repo:** PatientTrac/patienttrac-revela
- **Local Path:** ~/patienttrac-revela
- **Database:** Shares main Supabase (`mskormozwekezjmtcylv`)
- **Clinical Tables:**
  - cr.surgical_prognote
  - cr.operative_notes
  - cr.postop_plan
  - cr.breast_exam
- **Audit Needs:**
  - Surgical note access (PHI)
  - Photo access (HIPAA sensitive)
  - Pre/post-op documentation views
  - Cross-app encounter access

---

## Audit Requirements

### HIPAA Compliance
- **Access Tracking:** Who accessed which patient record, when, from where
- **Minimum Retention:** 6 years (HIPAA requirement)
- **Data Captured:**
  - User ID (email from auth)
  - Patient ID (when applicable)
  - Resource accessed (table, form, document)
  - Action type (view, edit, delete, export)
  - Timestamp (UTC)
  - IP address
  - User agent
  - Session ID
  - Success/failure status

### DEA Controlled Substance Logs
- **Federal Requirement:** 21 CFR § 1304.21
- **Retention:** 2 years minimum
- **Additional Fields:**
  - Drug name, NDC, strength
  - Quantity dispensed
  - Patient identifier (if dispensed to patient)
  - Prescriber DEA number
  - Dispensing staff ID
  - Inventory balance before/after

### Cross-System Sync Tracking
- **Purpose:** Track data flow between applications
- **Example:** PatientTracForge creates encounter → Revela consumes encounter_id
- **Fields:**
  - Source system
  - Destination system
  - Entity type (encounter, patient, provider)
  - Entity ID
  - Sync status (success, failure, pending)
  - Error message (if failed)

---

## Technical Architecture

### Database Schema (audit project)

```sql
-- Main audit log
CREATE TABLE audit.access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  application TEXT NOT NULL,  -- 'patienttrac-or', 'revela', 'patienttrac-surg'
  action_type TEXT NOT NULL,  -- 'view', 'edit', 'delete', 'export', 'download'
  resource_type TEXT NOT NULL, -- 'patient', 'encounter', 'form', 'document', 'dea_log'
  resource_id TEXT,           -- patient_id, encounter_id, form_id, etc.
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB,             -- Flexible storage for app-specific data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DEA-specific audit (stricter requirements)
CREATE TABLE audit.dea_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  drug_name TEXT NOT NULL,
  ndc TEXT,
  strength TEXT,
  quantity_dispensed NUMERIC,
  patient_id UUID,
  prescriber_dea TEXT,
  inventory_before NUMERIC,
  inventory_after NUMERIC,
  action_type TEXT NOT NULL,  -- 'dispense', 'receive', 'waste', 'return', 'adjust'
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync tracking between systems
CREATE TABLE audit.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system TEXT NOT NULL,
  destination_system TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  sync_status TEXT NOT NULL,  -- 'success', 'failure', 'pending'
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_access_log_org_user ON audit.access_log(org_id, user_id);
CREATE INDEX idx_access_log_created ON audit.access_log(created_at DESC);
CREATE INDEX idx_access_log_resource ON audit.access_log(resource_type, resource_id);
CREATE INDEX idx_dea_log_org ON audit.dea_access_log(org_id);
CREATE INDEX idx_dea_log_created ON audit.dea_access_log(created_at DESC);
CREATE INDEX idx_sync_log_entity ON audit.sync_log(entity_type, entity_id);
```

### Edge Function: log-audit-event

```typescript
// Deployed to audit Supabase project
// Called by all applications via POST

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const {
    org_id,
    user_id,
    user_email,
    application,
    action_type,
    resource_type,
    resource_id,
    ip_address,
    user_agent,
    session_id,
    success,
    error_message,
    metadata
  } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { error } = await supabase
    .from('access_log')
    .insert({
      org_id,
      user_id,
      user_email,
      application,
      action_type,
      resource_type,
      resource_id,
      ip_address,
      user_agent,
      session_id,
      success,
      error_message,
      metadata
    })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### Client-Side Integration

Each application needs a utility function:

```typescript
// utils/audit.ts
export async function logAuditEvent({
  action_type,
  resource_type,
  resource_id,
  metadata = {}
}: {
  action_type: string
  resource_type: string
  resource_id?: string
  metadata?: Record<string, any>
}) {
  const user = await supabase.auth.getUser()
  const session = await supabase.auth.getSession()

  await fetch('https://lazieeewetgxixdvfmmq.supabase.co/functions/v1/log-audit-event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.data.session?.access_token}`
    },
    body: JSON.stringify({
      org_id: getCurrentOrgId(),
      user_id: user.data.user?.id,
      user_email: user.data.user?.email,
      application: 'patienttrac-or', // or 'revela', 'patienttrac-surg'
      action_type,
      resource_type,
      resource_id,
      ip_address: null, // Edge function can extract from request
      user_agent: navigator.userAgent,
      session_id: session.data.session?.access_token.slice(0, 20),
      success: true,
      metadata
    })
  })
}

// Usage examples:
// View patient in OR app
await logAuditEvent({
  action_type: 'view',
  resource_type: 'patient',
  resource_id: patientId
})

// Access DEA log
await logAuditEvent({
  action_type: 'view',
  resource_type: 'dea_log',
  resource_id: logId,
  metadata: { drug_name: 'Fentanyl 100mcg' }
})

// Download surgical form from PatientTracSurg
await logAuditEvent({
  action_type: 'download',
  resource_type: 'form',
  resource_id: 'breast-augmentation-consent'
})
```

---

## Integration Points

### PatientTracOR (highest priority)
1. **DEA Log Access:** Every view of `dea_controlled_substance_log` table
2. **Medication Dispensing:** Every insert into medication log
3. **Patient-Linked Equipment:** When equipment assigned to specific case
4. **Live Case Viewer:** Every access to real-time surgical case data

### Revela
1. **Operative Note Access:** View/edit of `cr.operative_notes`
2. **Photo Access:** View of surgical photos (HIPAA sensitive)
3. **Encounter Handoff:** When PatientTracForge routes to Revela

### PatientTracSurg
1. **Form Downloads:** Track PDF downloads of surgical forms
2. **Form Submissions:** If forms become dynamic (future)

---

## Dashboard UI Requirements

### Main Dashboard View
- **Total Events Today:** Count card
- **DEA Access Alerts:** Highlight unusual access patterns
- **Failed Access Attempts:** Security monitoring
- **Top Users by Activity:** Table
- **Events by Application:** Pie chart

### Filters
- Date range picker
- Application dropdown
- User search
- Action type filter
- Resource type filter

### Export
- CSV export for compliance audits
- Date range required (max 90 days per export)

---

## Security Considerations

1. **Separate Supabase Project:** Audit logs isolated from main platform
2. **Service Role Key Only:** Client apps use edge function, not direct DB access
3. **No PHI in Logs:** Only IDs, never patient names or SSN
4. **RLS Policies:** Org-level isolation on all audit tables
5. **Retention Policy:** Auto-archive to cold storage after 2 years (pg_cron)

---

## Next Steps

1. Create `patienttrac-audit-hub` GitHub repo
2. Initialize React + TypeScript + Vite project
3. Apply audit schema migrations to `lazieeewetgxixdvfmmq`
4. Deploy `log-audit-event` edge function
5. Create Netlify site for dashboard UI
6. Integrate audit logging into PatientTracOR (highest priority)
7. Integrate into Revela
8. Integrate into PatientTracSurg (lowest priority)

---

## Questions to Resolve

1. **Dashboard URL:** `audit.patienttrac.com` or `patienttrac-audit.com`?
2. **Access Control:** Who can view audit logs? (Super admin only? Compliance officer role?)
3. **Alerting:** Email alerts for suspicious patterns? (e.g., 10+ DEA log accesses in 1 hour)
4. **Retention Beyond 6 Years:** Archive to S3? Or hard delete?

---

*Prepared for Audit Hub implementation chat — April 30, 2026*
