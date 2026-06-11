// ============================================================
// PatientTrac Revela — Consent Sender
// Netlify Function: /.netlify/functions/send-consent
// Creates consent record + token, sends patient email link
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

const RESEND_API = 'https://api.resend.com/emails';

interface SendConsentRequest {
  orgId:            string;
  encounterId?:     number;
  templateId?:      number;
  templateName:     string;
  patientFirstName: string;
  patientLastName:  string;
  patientEmail:     string;
  patientDob?:      string;
  procedureName:    string;
  surgeonName:      string;
  facilityName:     string;
  consentStatement?: string;
  risksGeneral?:     string[];
  risksSpecific?:    string[];
  risksAnesthesia?:  string[];
  benefits?:         string[];
  alternatives?:     string[];
  noGuaranteeClause?: string;
  photographyClause?: string;
}

function svcHeaders(key: string) {
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SVC_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const APP_URL      = process.env.URL ?? 'https://patienttrac-revela.com';
  const FROM_EMAIL   = process.env.CONSENT_FROM_EMAIL ?? 'consents@patienttrac-revela.com';

  if (!SUPABASE_URL || !SVC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  let body: SendConsentRequest;
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const required = ['orgId', 'patientFirstName', 'patientLastName', 'patientEmail', 'procedureName', 'facilityName'];
  const missing = required.filter(k => !(body as any)[k]);
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing: ${missing.join(', ')}` }) };
  }

  const hdrs = { ...svcHeaders(SVC_KEY), 'Content-Profile': 'cr', 'Prefer': 'return=representation' };

  // 1. Create consent record
  const consentRes = await fetch(`${SUPABASE_URL}/rest/v1/patient_consents`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({
      org_id:             body.orgId,
      encounter_id:       body.encounterId ?? null,
      template_id:        body.templateId  ?? null,
      patient_first_name: body.patientFirstName,
      patient_last_name:  body.patientLastName,
      patient_email:      body.patientEmail,
      patient_dob:        body.patientDob   ?? null,
      procedure_name:     body.procedureName,
      surgeon_name:       body.surgeonName  ?? null,
      facility_name:      body.facilityName,
      status:             'pending',
    }),
  });

  if (!consentRes.ok) {
    const err = await consentRes.text();
    console.error('consent insert error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create consent record' }) };
  }
  const [consent] = await consentRes.json();
  const consentId = consent.consent_id;

  // 2. Create access token
  const tokenPayload: Record<string, any> = {
    consent_id: consentId,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  // Also store template content in consent_tokens for load-time retrieval
  const tokenRes = await fetch(`${SUPABASE_URL}/rest/v1/consent_tokens`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify(tokenPayload),
  });

  if (!tokenRes.ok) {
    console.error('token insert error:', await tokenRes.text());
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate token' }) };
  }
  const [tokenRow] = await tokenRes.json();
  const token = tokenRow.token;
  const consentUrl = `${APP_URL}/consent/${token}`;

  // 3. Update consent status to 'sent'
  await fetch(`${SUPABASE_URL}/rest/v1/patient_consents?consent_id=eq.${consentId}`, {
    method: 'PATCH',
    headers: { ...svcHeaders(SVC_KEY), 'Content-Profile': 'cr' },
    body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
  });

  // 4. Send patient email (if Resend configured)
  if (RESEND_KEY) {
    const html = buildConsentEmail({
      patientName: `${body.patientFirstName} ${body.patientLastName}`,
      facilityName: body.facilityName,
      surgeonName: body.surgeonName,
      procedureName: body.procedureName,
      consentUrl,
      templateName: body.templateName,
    });

    await fetch(RESEND_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: `${body.facilityName} <${FROM_EMAIL}>`,
        to:   [body.patientEmail],
        subject: `Please Review & Sign: ${body.procedureName} Consent Form — ${body.facilityName}`,
        html,
      }),
    }).catch(e => console.error('email send error:', e));
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, consentId, token, consentUrl }),
  };
};

function buildConsentEmail({ patientName, facilityName, surgeonName, procedureName, consentUrl, templateName }: Record<string, string>) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#0a1628,#1a2d4e);padding:32px 36px;">
    <div style="color:#c9a96e;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">${facilityName}</div>
    <div style="color:#ffffff;font-size:24px;font-weight:700;margin-bottom:4px;">Consent Form Ready to Sign</div>
    <div style="color:rgba(255,255,255,0.5);font-size:13px;">Action required — please review and sign</div>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#c9a96e,#e8cc8f,#c9a96e);"></td></tr>
  <tr><td style="padding:32px 36px;">
    <p style="color:#1a2a4a;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Dear ${patientName},<br/><br/>
      Your informed consent form for <strong>${procedureName}</strong> with <strong>${surgeonName}</strong> is ready for your review and signature.
    </p>
    <div style="background:#f7f5f0;border-radius:12px;padding:16px 20px;margin-bottom:24px;border-left:4px solid #c9a96e;">
      <div style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Consent Form</div>
      <div style="color:#0a1628;font-size:15px;font-weight:700;">${templateName}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">Please read carefully before signing</div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${consentUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a96e,#e8cc8f);color:#0a1628;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
        Review &amp; Sign Consent Form →
      </a>
    </div>
    <div style="background:#fef9ee;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
      <div style="color:#92400e;font-size:12px;font-weight:600;margin-bottom:4px;">⏱ This link expires in 30 days</div>
      <div style="color:#78350f;font-size:12px;">You can sign on any device — phone, tablet, or computer. Your signature is legally binding.</div>
    </div>
    <p style="color:#6b7280;font-size:11px;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:16px;margin:0;">
      This consent request was sent by ${facilityName}. If you did not expect this, please contact our office directly.
      Do not click the link if you are unsure of its origin.
    </p>
  </td></tr>
  <tr><td style="background:#0a1628;padding:16px 36px;text-align:center;">
    <div style="color:rgba(255,255,255,0.4);font-size:11px;">${facilityName} · Powered by <span style="color:#c9a96e;font-weight:700;">PatientTrac Revela</span></div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
