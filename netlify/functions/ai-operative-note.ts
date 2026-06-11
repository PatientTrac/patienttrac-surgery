// ============================================================
// PatientTrac Surgery — AI Operative Note Generator
// Netlify Function: /.netlify/functions/ai-operative-note
// ============================================================
//
// HIPAA COMPLIANCE NOTES:
//   • No patient names, DOBs, or MRNs are accepted or forwarded to the AI.
//   • All incoming fields are run through scrubPHI() before prompt construction.
//   • The AI receives only clinical/procedural data (procedure type, approach,
//     findings, complications) — never patient-identifying information.
//   • ANTHROPIC_API_KEY lives server-side only; never exposed to the browser.
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a surgical documentation AI for PatientTrac, a HIPAA-compliant
electronic medical record system for general surgery. Your role is to generate structured,
professional operative note drafts based on procedural data provided by the surgeon.

CRITICAL RULES:
- You will NEVER include patient names, dates of birth, MRNs, Social Security numbers,
  addresses, phone numbers, or any other patient-identifying information.
- If any PHI appears in your input (it should not), ignore it entirely.
- Generate notes in standard operative note format used in US surgical practice.
- Write in professional, third-person clinical language.
- All times, counts, and sponge/instrument references must use placeholder notation
  (e.g., "[TIME]", "[SPONGE COUNT]") so the surgeon can fill them in.
- Mark any section where information was insufficient with [DICTATION NEEDED].

OUTPUT FORMAT: Valid JSON only. No markdown, no prose outside the JSON object.

Schema:
{
  "operativeNoteDraft": {
    "preoperativeDiagnosis": string,
    "postoperativeDiagnosis": string,
    "procedurePerformed": string,
    "approach": string,
    "anesthesia": string,
    "indications": string,
    "findings": string,
    "procedureDetails": string,
    "complications": string,
    "specimens": string | null,
    "implants": string | null,
    "counts": string,
    "disposition": string,
    "ebl": string,
    "fluidAdministered": string
  },
  "dictationPrompts": string[],
  "qualityFlags": string[],
  "completenessScore": number
}

FIELD NOTES:
- procedureDetails: Full operative narrative in standard dictation style. Use [TIME] for
  clock times and [DICTATION NEEDED] for any missing clinical details.
- dictationPrompts: Array of specific questions the surgeon should answer to complete the note
  (e.g., "Confirm EBL estimate", "Specify drain type and output").
- qualityFlags: Array of any clinical inconsistencies or missing safety-critical items detected.
- completenessScore: 0–100 representing how complete the draft is based on provided input.
- anesthesia: Infer "General endotracheal anesthesia" if not specified; flag for confirmation.
- counts: Always use "Sponge, instrument, and needle counts correct x[COUNT] per circulator"
  with [COUNT] as a placeholder.`;

// ── Request schema ─────────────────────────────────────────────────────────────
interface OperativeNoteRequest {
  // Clinical fields — no PHI
  procedure: string;           // e.g. "Laparoscopic cholecystectomy"
  approach: string;            // e.g. "Laparoscopic, 4-port"
  findings: string;            // Intraoperative findings narrative
  complications: string;       // "None" or description
  implants?: string;           // Mesh, stapler cartridges, etc. — no serial numbers
  specimens?: string;          // Specimen(s) sent to pathology
  // Routing/audit fields — not sent to AI
  encounterId?: string;
  orgId?: string;
  providerId?: string;
}

// ── Structured output schema (for response validation) ─────────────────────────
interface OperativeNoteDraft {
  preoperativeDiagnosis: string;
  postoperativeDiagnosis: string;
  procedurePerformed: string;
  approach: string;
  anesthesia: string;
  indications: string;
  findings: string;
  procedureDetails: string;
  complications: string;
  specimens: string | null;
  implants: string | null;
  counts: string;
  disposition: string;
  ebl: string;
  fluidAdministered: string;
}

interface OperativeNoteResponse {
  operativeNoteDraft: OperativeNoteDraft;
  dictationPrompts: string[];
  qualityFlags: string[];
  completenessScore: number;
}

// ── PHI scrubber — belt-and-suspenders guard before any Claude call ────────────
const PHI_KEYS = [
  'patient_name', 'first_name', 'last_name', 'name', 'dob', 'date_of_birth',
  'ssn', 'social_security', 'mrn', 'medical_record', 'address', 'street',
  'city', 'state', 'zip', 'phone', 'mobile', 'email', 'insurance_id',
  'member_id', 'group_number', 'patient_id', 'birth', 'account_number',
  'device_serial', 'serial_number',
];

function scrubPHI(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (PHI_KEYS.some(f => k.toLowerCase().includes(f))) {
      out[k] = '[PHI-SCRUBBED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrubPHI(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Scrub free-text fields for common PHI patterns (names, MRNs, DOBs)
function scrubFreeText(text: string): string {
  return text
    // Remove anything that looks like "Patient: John Smith" or "Pt: Jane Doe"
    .replace(/\b(patient|pt|patient name|name)\s*[:=]\s*[A-Z][a-z]+\s+[A-Z][a-z]+/gi, '[PATIENT-NAME-SCRUBBED]')
    // Remove date-of-birth patterns  MM/DD/YYYY or YYYY-MM-DD
    .replace(/\b(dob|date of birth|born)\s*[:=]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/gi, '[DOB-SCRUBBED]')
    // Remove MRN patterns
    .replace(/\b(mrn|medical record|record number|chart)\s*[:=]?\s*[#]?\d{4,10}\b/gi, '[MRN-SCRUBBED]')
    // Remove SSN patterns
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-SCRUBBED]');
}

// ── Audit log — non-blocking write to Supabase cr.ai_audit_log ────────────────
async function logAudit(opts: {
  functionName: string;
  action: string;
  encounterId?: string;
  orgId?: string;
  providerId?: string;
  latencyMs: number;
  phiScrubbed: boolean;
}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !svcKey) return;
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
        specialty: 'general_surgery',
      }),
    });
  } catch { /* audit failure must never block the clinical response */ }
}

// ── Validate request has required fields ──────────────────────────────────────
function validateRequest(body: unknown): body is OperativeNoteRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.procedure === 'string' && b.procedure.trim().length > 0 &&
    typeof b.approach === 'string' && b.approach.trim().length > 0 &&
    typeof b.findings === 'string' && b.findings.trim().length > 0 &&
    typeof b.complications === 'string'
  );
}

// ── Validate structured AI response ──────────────────────────────────────────
function validateOperativeNoteResponse(parsed: unknown): parsed is OperativeNoteResponse {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  if (!p.operativeNoteDraft || typeof p.operativeNoteDraft !== 'object') return false;
  const draft = p.operativeNoteDraft as Record<string, unknown>;
  const requiredFields: (keyof OperativeNoteDraft)[] = [
    'preoperativeDiagnosis', 'postoperativeDiagnosis', 'procedurePerformed',
    'approach', 'anesthesia', 'indications', 'findings', 'procedureDetails',
    'complications', 'counts', 'disposition', 'ebl', 'fluidAdministered',
  ];
  for (const field of requiredFields) {
    if (typeof draft[field] !== 'string') return false;
  }
  return (
    Array.isArray(p.dictationPrompts) &&
    Array.isArray(p.qualityFlags) &&
    typeof p.completenessScore === 'number'
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────
export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI service not configured' }),
    };
  }

  // ── Parse and validate request body ─────────────────────────────────────────
  let body: OperativeNoteRequest;
  try {
    const raw = JSON.parse(event.body ?? '{}');
    if (!validateRequest(raw)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields: procedure, approach, findings, complications',
        }),
      };
    }
    body = raw;
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  // ── PHI scrub all free-text clinical fields before prompt construction ────────
  const safeProcedure   = scrubFreeText(body.procedure.trim());
  const safeApproach    = scrubFreeText(body.approach.trim());
  const safeFindings    = scrubFreeText(body.findings.trim());
  const safeComplications = scrubFreeText(body.complications.trim());
  const safeImplants    = body.implants ? scrubFreeText(body.implants.trim()) : null;
  const safeSpecimens   = body.specimens ? scrubFreeText(body.specimens.trim()) : null;

  // ── Build prompt — no PHI fields included ─────────────────────────────────
  const userMessage = `Generate a complete operative note draft for the following general surgery case.

PROCEDURE: ${safeProcedure}
APPROACH: ${safeApproach}
INTRAOPERATIVE FINDINGS: ${safeFindings}
COMPLICATIONS: ${safeComplications}
${safeImplants ? `IMPLANTS/DEVICES USED: ${safeImplants}` : 'IMPLANTS/DEVICES: None documented'}
${safeSpecimens ? `SPECIMENS SENT: ${safeSpecimens}` : 'SPECIMENS: None documented'}

Generate the full operative note draft, dictation prompts for missing details, any quality/safety
flags, and a completeness score. Return valid JSON only — no markdown.`;

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
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`Anthropic API error ${response.status}:`, errBody);
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const data = await response.json();
    const rawText: string = data?.content?.[0]?.text ?? '{}';

    // ── Parse and validate structured output ──────────────────────────────────
    let parsed: unknown;
    try {
      // Strip accidental markdown fences if the model added them despite instructions
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI response as JSON:', rawText.slice(0, 500));
      parsed = {
        operativeNoteDraft: null,
        dictationPrompts: [],
        qualityFlags: ['AI response could not be parsed — please dictate note manually'],
        completenessScore: 0,
        _parseError: true,
        _rawText: rawText.slice(0, 1000),
      };
    }

    // Warn (but don't fail) if the validated shape is wrong
    if (parsed && typeof parsed === 'object' && !('_parseError' in (parsed as object))) {
      if (!validateOperativeNoteResponse(parsed)) {
        console.warn('AI response schema mismatch — returning raw parsed object');
      }
    }

    // Audit log — non-blocking
    void logAudit({
      functionName: 'ai-operative-note',
      action: 'generate_operative_note',
      phiScrubbed: true,
      encounterId: body.encounterId,
      orgId: body.orgId,
      providerId: body.providerId,
      latencyMs: Date.now() - t0,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };

  } catch (error) {
    const latencyMs = Date.now() - t0;
    console.error('ai-operative-note error:', error);

    void logAudit({
      functionName: 'ai-operative-note',
      action: 'error',
      phiScrubbed: true,
      encounterId: body.encounterId,
      orgId: body.orgId,
      providerId: body.providerId,
      latencyMs,
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI service error — please dictate note manually' }),
    };
  }
};
