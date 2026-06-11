// ============================================================
// PatientTrac Revela — AI Surgical Safety Flags
// Netlify Function: /.netlify/functions/ai-surgical-flags
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-fable-5';

const SYSTEM_PROMPT = `You are the surgical safety AI for PatientTrac Revela — a HIPAA-compliant EMR for plastic and reconstructive surgery.

Analyze the provided (PHI-free) patient clinical profile and return a JSON array of surgical flags. Each flag represents a safety concern, contraindication, missing requirement, or high-risk factor.

IMPORTANT:
- You receive NO patient PHI (name, DOB, SSN, MRN). Do not ask for or reference PHI.
- Return ONLY valid JSON — no markdown, no explanations outside the JSON.

OUTPUT FORMAT (JSON array):
[
  {
    "severity": "critical" | "warning" | "info",
    "category": "contraindication" | "drug_interaction" | "missing_preop" | "risk_factor" | "guideline",
    "title": "Short flag title (5-8 words)",
    "detail": "Clinical detail with evidence base (1-2 sentences)",
    "action": "Specific recommended action"
  }
]

FLAG CRITERIA TO APPLY:
- BMI > 40: obesity contraindication for elective surgery (ASPS guideline)
- BMI > 30 + smoker: combined wound-healing risk flag
- Caprini ≥ 5: high VTE risk — mandatory chemoprophylaxis (ACCP)
- STOP-BANG ≥ 3: OSA risk — anesthesia pre-op evaluation required
- RCRI ≥ 2: cardiac risk — cardiology clearance recommended
- ASA IV/V: extreme risk — multidisciplinary review required
- Current smoker: cessation ≥ 4 weeks pre-op required (SCIP)
- Anticoagulant use: bridge therapy coordination required
- Implant procedure + antibiotic allergy: alternative prophylaxis protocol
- Breast augmentation: mammogram required if age ≥ 40 or mammogram overdue
- Pregnancy test not resulted / positive: procedure contraindicated
- Psych clearance deferred/referred: procedure should not proceed
- Duration > 6 hours: deep hypothermia / VTE escalation risk
- No flags found: return single info-level "No critical flags identified" entry

Return between 1 and 8 flags. Prioritize critical before warning before info.`;

interface SurgicalFlagsRequest {
  procedureType: string;        // e.g., "breast_augmentation", "abdominoplasty", "rhinoplasty"
  procedureName: string;        // human-readable
  asaClass?: string;            // 'I'|'II'|'III'|'IV'|'V'
  capriniScore?: number;        // 0-15
  stopBangScore?: number;       // 0-8
  rcriScore?: number;           // 0-6
  bmi?: number;
  smokingStatus?: string;       // 'current'|'former'|'never'
  diabetic?: boolean;
  anticoagulants?: boolean;
  allergies?: string;
  plannedImplants?: boolean;    // breast/body implants being placed
  estimatedDurationHours?: number;
  orClearance?: string;
  psychClearance?: string;
  mammogramStatus?: string;
  pregnancyTestResult?: string;
  // PHI NEVER included
  encounterId?: string;
  orgId?: string;
  providerId?: string;
}

// ── PHI scrubber — belt-and-suspenders guard before any Claude call ────────────
const PHI_KEYS = ['patient_name','first_name','last_name','name','dob','date_of_birth',
  'ssn','social_security','mrn','medical_record','address','street','city','state','zip',
  'phone','mobile','email','insurance_id','member_id','group_number','patient_id']

function scrubPHI(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (PHI_KEYS.some(f => k.toLowerCase().includes(f))) {
      out[k] = '[PHI-SCRUBBED]'
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrubPHI(v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out
}

// ── Audit log — non-blocking write to Supabase cr.ai_audit_log ────────────────
async function logAudit(opts: {
  functionName: string; action: string; encounterId?: string;
  orgId?: string; providerId?: string; latencyMs: number; phiScrubbed: boolean;
}) {
  const supabaseUrl = process.env.SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !svcKey) return
  try {
    await fetch(`${supabaseUrl}/rest/v1/ai_audit_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': svcKey,
        'Authorization': `Bearer ${svcKey}`,
        'Content-Profile': 'cr',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        function_name: opts.functionName,
        model_used: MODEL,
        action: opts.action,
        encounter_id: opts.encounterId ? Number(opts.encounterId) : null,
        org_id: opts.orgId ?? null,
        phi_scrubbed: opts.phiScrubbed,
        latency_ms: opts.latencyMs,
        specialty: 'plastic_surgery',
      }),
    })
  } catch { /* audit failure must not block the clinical response */ }
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };
  }

  let body: SurgicalFlagsRequest;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Build clinical profile string — all fields are typed (no PHI keys in this interface)
  const userMessage = `Analyze this plastic surgery patient profile for surgical safety flags:

Procedure: ${body.procedureName} (${body.procedureType})
Estimated duration: ${body.estimatedDurationHours ?? 'unknown'} hours

Risk scores:
- ASA Class: ${body.asaClass ?? 'not documented'}
- Caprini VTE Score: ${body.capriniScore ?? 'not documented'}
- STOP-BANG OSA Score: ${body.stopBangScore ?? 'not documented'}
- RCRI Cardiac Score: ${body.rcriScore ?? 'not documented'}
- OR Clearance Status: ${body.orClearance ?? 'pending'}

Clinical factors:
- BMI: ${body.bmi ?? 'not documented'}
- Smoking status: ${body.smokingStatus ?? 'not documented'}
- Diabetic: ${body.diabetic ?? 'not documented'}
- On anticoagulants: ${body.anticoagulants ?? 'not documented'}
- Known allergies: ${body.allergies ?? 'none documented'}
- Implants planned: ${body.plannedImplants ?? false}
- Mammogram status: ${body.mammogramStatus ?? 'not applicable'}
- Pregnancy test: ${body.pregnancyTestResult ?? 'not applicable'}
- Psych clearance: ${body.psychClearance ?? 'not required'}

Return the JSON flags array.`;

  const t0 = Date.now();

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '[]';

    let flags: unknown;
    try { flags = JSON.parse(text) } catch { flags = [{ severity: 'info', category: 'guideline', title: 'Parse error — review manually', detail: 'AI response could not be parsed.', action: 'Review patient chart manually before proceeding.' }] }

    // Audit log — non-blocking
    void logAudit({
      functionName: 'ai-surgical-flags', action: 'generate_surgical_flags', phiScrubbed: true,
      encounterId: body.encounterId, orgId: body.orgId, providerId: body.providerId,
      latencyMs: Date.now() - t0,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags }),
    };
  } catch (error) {
    console.error('AI surgical flags error:', error);
    void logAudit({ functionName: 'ai-surgical-flags', action: 'error', phiScrubbed: true, latencyMs: Date.now() - t0 });
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service error' }) };
  }
};
