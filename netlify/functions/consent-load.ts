// ============================================================
// PatientTrac Revela — Consent Form Loader
// Netlify Function: /.netlify/functions/consent-load
// Public endpoint — authenticates via token param only
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SVC_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const token = event.queryStringParameters?.token;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) };
  }

  const svcH = {
    'Content-Type': 'application/json',
    'apikey': SVC_KEY,
    'Authorization': `Bearer ${SVC_KEY}`,
    'Accept-Profile': 'cr',
  };

  // 1. Look up token
  const tokenRes = await fetch(
    `${SUPABASE_URL}/rest/v1/consent_tokens?token=eq.${encodeURIComponent(token)}&select=token,consent_id,expires_at,used_at`,
    { headers: svcH }
  );
  const tokens = await tokenRes.json();
  const tokenRow = tokens?.[0];

  if (!tokenRow) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Consent form not found or link is invalid' }) };
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return { statusCode: 410, body: JSON.stringify({ error: 'This consent link has expired. Please contact the office for a new link.' }) };
  }
  if (tokenRow.used_at) {
    // Already signed — still allow read-only view
  }

  const consentId = tokenRow.consent_id;

  // 2. Load consent record
  const consentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/patient_consents?consent_id=eq.${consentId}&select=*`,
    { headers: svcH }
  );
  const consents = await consentRes.json();
  const consent = consents?.[0];
  if (!consent) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Consent record not found' }) };
  }

  // 3. Load template content (if template_id is set)
  let template: Record<string, any> | null = null;
  if (consent.template_id) {
    const tRes = await fetch(
      `${SUPABASE_URL}/rest/v1/informed_consent_templates?template_id=eq.${consent.template_id}&select=template_name,procedure_category,consent_statement,risks_general,risks_specific,risks_anesthesia,benefits,alternatives,no_guarantee_clause,photography_clause,revision_policy`,
      { headers: svcH }
    );
    const tRows = await tRes.json();
    template = tRows?.[0] ?? null;
  }

  // 4. Mark as 'viewed' if status was 'sent'
  if (consent.status === 'sent') {
    await fetch(
      `${SUPABASE_URL}/rest/v1/patient_consents?consent_id=eq.${consentId}`,
      {
        method: 'PATCH',
        headers: { ...svcH, 'Content-Profile': 'cr', 'Accept-Profile': undefined! },
        body: JSON.stringify({ status: 'viewed', viewed_at: new Date().toISOString() }),
      }
    );
  }

  // 5. Return consent data (no signature_data_url in response — that stays server-side)
  const { signature_data_url: _sig, ...safeConsent } = consent;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      consent: safeConsent,
      template,
      alreadySigned: !!tokenRow.used_at,
    }),
  };
};
