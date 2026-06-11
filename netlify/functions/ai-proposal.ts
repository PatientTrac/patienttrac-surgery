// ============================================================
// PatientTrac Revela — AI Surgical Proposal Generator
// Netlify Function: /.netlify/functions/ai-proposal
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-fable-5';

const SYSTEM_PROMPT = `You are the Revela billing and proposal AI for PatientTrac — a HIPAA-compliant
EMR for plastic and reconstructive surgery. Your role is to generate accurate, itemized surgical
cost proposals and patient-facing financing summaries.

FEE GUIDELINES (adjust based on provided overrides):
- Surgeon fee: $4,000–$12,000 depending on procedure complexity
- Anesthesia: $600/hour (estimate from procedure duration)
- OR facility fee: $3,000–$6,000 depending on duration and suite tier
- Implants/materials: actual cost from inventory if available, else estimate
- Post-op visits (2 standard): $350–$500 total
- Garments/supplies: $150–$250

FINANCING OPTIONS:
1. Pay in full — apply 5% courtesy discount
2. CareCredit 24-month 0% — no discount, calculate $X/month
3. In-house plan — 20% down, balance over 10 months, 0% interest

OUTPUT FORMAT: Valid JSON only. No markdown.
Schema: { lineItems: CostLineItem[], totalEstimate: number, financingOptions: FinancingOption[],
          patientSummary: string }

CostLineItem: { label, amount, category, editable: true }
FinancingOption: { type, label, totalAmount, downPayment?, monthlyPayment?, termMonths?, discountApplied? }
patientSummary: 2-sentence plain English summary for patient-facing proposal cover page`;

interface ProposalRequest {
  procedureType: string;
  procedureName: string;
  estimatedDurationHours: number;
  // patientName intentionally removed from AI prompt — PHI must not reach Anthropic API
  surgeonName: string;
  encounterId?: string;
  orgId?: string;
  providerId?: string;
  feeOverrides?: Record<string, number>;
  includeContralateral?: boolean;
  includeNAR?: boolean;
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

  let body: ProposalRequest;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Build prompt — patient name is intentionally excluded (procedure-level, not patient-level)
  const userMessage = `Generate a complete surgical cost proposal for the following:

Procedure: ${body.procedureName} (${body.procedureType})
Estimated duration: ${body.estimatedDurationHours} hours
Surgeon: ${body.surgeonName}
${body.feeOverrides ? `Fee overrides: ${JSON.stringify(scrubPHI(body.feeOverrides as Record<string, unknown>))}` : ''}
${body.includeContralateral ? 'Include: Contralateral symmetry procedure (augmentation)' : ''}
${body.includeNAR ? 'Include: Staged nipple-areola reconstruction (separate line item)' : ''}

Generate all line items, total estimate, three financing options, and patient summary.`;

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
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '{}';

    let parsed: unknown;
    try { parsed = JSON.parse(text) } catch { parsed = { error: 'Parse error', raw: text } }

    // Audit log — non-blocking
    void logAudit({
      functionName: 'ai-proposal', action: 'generate_proposal', phiScrubbed: true,
      encounterId: body.encounterId, orgId: body.orgId, providerId: body.providerId,
      latencyMs: Date.now() - t0,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (error) {
    console.error('AI proposal error:', error);
    void logAudit({ functionName: 'ai-proposal', action: 'error', phiScrubbed: true, latencyMs: Date.now() - t0 });
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service error' }) };
  }
};
