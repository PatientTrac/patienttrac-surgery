// ============================================================
// PatientTrac Revela — Consent Submission Handler
// Netlify Function: /.netlify/functions/consent-submit
// Public endpoint — authenticates via token in body
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

const RESEND_API = 'https://api.resend.com/emails';

interface ConsentSubmitRequest {
  token:               string;
  agreedToProcedure:   boolean;
  agreedToRisks:       boolean;
  agreedToAnesthesia:  boolean;
  agreedToPhotos:      boolean;
  patientQuestions?:   string;
  signatureDataUrl:    string; // base64 PNG canvas capture
}

function svcHeaders(key: string, profile?: string) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  };
  if (profile) h['Accept-Profile'] = profile;
  return h;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SVC_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const FROM_EMAIL   = process.env.NOTIFY_FROM_EMAIL ?? 'noreply@patienttrac.com';

  let body: ConsentSubmitRequest;
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  if (!body.token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) };
  }
  if (!body.signatureDataUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Signature is required' }) };
  }
  if (!body.agreedToProcedure || !body.agreedToRisks) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Patient must agree to procedure and risks' }) };
  }

  const crH   = svcHeaders(SVC_KEY, 'cr');
  const baseH = svcHeaders(SVC_KEY);

  // 1. Validate token
  const tokenRes = await fetch(
    `${SUPABASE_URL}/rest/v1/consent_tokens?token=eq.${encodeURIComponent(body.token)}&select=token,consent_id,expires_at,used_at`,
    { headers: crH }
  );
  const tokenRows = await tokenRes.json();
  const tokenRow = tokenRows?.[0];

  if (!tokenRow) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Invalid or expired consent link' }) };
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return { statusCode: 410, body: JSON.stringify({ error: 'This consent link has expired' }) };
  }
  if (tokenRow.used_at) {
    return { statusCode: 409, body: JSON.stringify({ error: 'This consent has already been signed' }) };
  }

  const consentId = tokenRow.consent_id;
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? '';
  const ua = event.headers['user-agent'] ?? '';
  const signedAt = new Date().toISOString();

  // 2. Save signature + agreements
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/patient_consents?consent_id=eq.${consentId}`,
    {
      method: 'PATCH',
      headers: { ...baseH, 'Content-Profile': 'cr', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        agreed_to_procedure:  body.agreedToProcedure,
        agreed_to_risks:      body.agreedToRisks,
        agreed_to_anesthesia: body.agreedToAnesthesia,
        agreed_to_photos:     body.agreedToPhotos,
        patient_questions:    body.patientQuestions ?? null,
        signature_data_url:   body.signatureDataUrl,
        signed_at:            signedAt,
        signed_method:        'canvas',
        signature_ip:         ip,
        signature_user_agent: ua,
        status:               'signed',
        updated_at:           signedAt,
      }),
    }
  );

  if (!updateRes.ok) {
    console.error('consent update error:', await updateRes.text());
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save consent' }) };
  }
  const [updatedConsent] = await updateRes.json();

  // 3. Mark token as used
  await fetch(
    `${SUPABASE_URL}/rest/v1/consent_tokens?token=eq.${encodeURIComponent(body.token)}`,
    {
      method: 'PATCH',
      headers: { ...baseH, 'Content-Profile': 'cr' },
      body: JSON.stringify({ used_at: signedAt }),
    }
  );

  // 4. Send confirmation emails (non-blocking)
  if (RESEND_KEY && updatedConsent) {
    const c = updatedConsent;
    const patientName = `${c.patient_first_name} ${c.patient_last_name}`;
    const facilityName = c.facility_name ?? 'Our Practice';

    // Patient confirmation
    if (c.patient_email) {
      fetch(RESEND_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: `${facilityName} <${FROM_EMAIL}>`,
          to: [c.patient_email],
          subject: `Consent Signed — ${c.procedure_name ?? 'Procedure'} at ${facilityName}`,
          html: buildPatientConfirmEmail({ patientName, facilityName, procedureName: c.procedure_name ?? '', signedAt }),
        }),
      }).catch(e => console.error('patient confirmation email error:', e));
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      consentId,
      signedAt,
      message: 'Consent successfully signed and recorded',
    }),
  };
};

function buildPatientConfirmEmail({ patientName, facilityName, procedureName, signedAt }: Record<string, string>) {
  const dateStr = new Date(signedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#0a1628,#1a2d4e);padding:28px 32px;">
    <div style="color:#c9a96e;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">${facilityName}</div>
    <div style="color:#ffffff;font-size:22px;font-weight:700;">Consent Confirmed ✓</div>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#c9a96e,#e8cc8f,#c9a96e);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="color:#1a2a4a;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Dear ${patientName},<br/><br/>
      Thank you for completing your informed consent form for <strong>${procedureName}</strong>.
      Your electronic signature has been recorded and securely stored.
    </p>
    <div style="background:#f0fdf4;border-radius:10px;padding:14px 18px;margin-bottom:20px;border:1px solid #bbf7d0;">
      <div style="color:#15803d;font-size:13px;font-weight:700;margin-bottom:3px;">✓ Consent Successfully Signed</div>
      <div style="color:#166534;font-size:12px;">Signed on: ${dateStr}</div>
    </div>
    <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0;">
      Please retain this email for your records. If you have any questions about the consent form or your procedure,
      contact our office at your earliest convenience.
    </p>
  </td></tr>
  <tr><td style="background:#0a1628;padding:14px 32px;text-align:center;">
    <div style="color:rgba(255,255,255,0.4);font-size:11px;">${facilityName} · Powered by <span style="color:#c9a96e;font-weight:700;">PatientTrac Revela</span></div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
