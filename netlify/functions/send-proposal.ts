// ============================================================
// PatientTrac Revela — Proposal Email Sender
// Netlify Function: /.netlify/functions/send-proposal
// Uses Resend API (RESEND_API_KEY env var)
// ============================================================

import type { Handler, HandlerEvent } from '@netlify/functions';

const RESEND_API = 'https://api.resend.com/emails';

interface FinancingOption {
  label: string;
  totalAmount: number;
  downPayment?: number;
  monthlyPayment?: number;
  termMonths?: number;
  discountApplied?: boolean;
}

interface SendProposalRequest {
  patientEmail:     string;
  patientName:      string;
  facilityName:     string;
  surgeonName:      string;
  procedureName:    string;
  totalEstimate:    number;
  patientSummary:   string;
  financingOptions: FinancingOption[];
  selectedFinancing: number;
  orgId?:           string;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n ?? 0);
}

function buildEmailHtml(req: SendProposalRequest): string {
  const chosen = req.financingOptions?.[req.selectedFinancing];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your Surgical Proposal — ${req.facilityName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0a1628 0%,#1a2d4e 100%);padding:32px 36px;">
      <div style="color:#c9a96e;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">${req.facilityName}</div>
      <div style="color:#ffffff;font-size:26px;font-weight:700;margin-bottom:4px;">Your Surgical Proposal</div>
      <div style="color:rgba(255,255,255,0.5);font-size:13px;">Prepared personally for you</div>
    </td>
  </tr>

  <!-- Gold bar -->
  <tr><td style="height:3px;background:linear-gradient(90deg,#c9a96e,#e8cc8f,#c9a96e);"></td></tr>

  <!-- Body -->
  <tr>
    <td style="padding:32px 36px;">

      <p style="color:#1a2a4a;font-size:15px;line-height:1.7;margin:0 0 24px 0;">
        Dear ${req.patientName},<br/><br/>
        Thank you for your consultation with <strong>${req.surgeonName}</strong>. We are pleased to present your personalized surgical proposal for <strong>${req.procedureName}</strong>.
      </p>

      ${req.patientSummary ? `
      <!-- Summary -->
      <div style="background:#f0f4ff;border-left:4px solid #4a7cc7;border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:24px;">
        <p style="color:#1a2a4a;font-size:14px;line-height:1.7;margin:0;font-style:italic;">"${req.patientSummary}"</p>
      </div>` : ''}

      <!-- Total estimate -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0a1628,#1a2d4e);border-radius:12px;margin-bottom:24px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <div style="color:rgba(255,255,255,0.55);font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">Total Estimate</div>
            <div style="color:#c9a96e;font-size:32px;font-weight:700;">${fmt(req.totalEstimate)}</div>
            <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:4px;">Itemized breakdown included in your full proposal</div>
          </td>
        </tr>
      </table>

      ${chosen ? `
      <!-- Financing -->
      <div style="border:2px solid #c9a96e;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="color:#0a1628;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Your Selected Financing Option</div>
        <div style="color:#0a1628;font-size:16px;font-weight:700;margin-bottom:12px;">${chosen.label}</div>
        <table width="100%" cellpadding="4" cellspacing="0">
          <tr>
            <td style="color:#6b7280;font-size:13px;">Total Amount</td>
            <td style="color:#0a1628;font-weight:700;font-size:13px;text-align:right;">${fmt(chosen.totalAmount)}</td>
          </tr>
          ${chosen.downPayment != null ? `
          <tr>
            <td style="color:#6b7280;font-size:13px;">Down Payment</td>
            <td style="color:#0a1628;font-weight:700;font-size:13px;text-align:right;">${fmt(chosen.downPayment)}</td>
          </tr>` : ''}
          ${chosen.monthlyPayment != null ? `
          <tr>
            <td style="color:#6b7280;font-size:13px;">Monthly Payment</td>
            <td style="color:#0a1628;font-weight:700;font-size:13px;text-align:right;">${fmt(chosen.monthlyPayment)} × ${chosen.termMonths} months</td>
          </tr>` : ''}
          ${chosen.discountApplied ? `
          <tr>
            <td colspan="2" style="color:#16a34a;font-size:12px;font-weight:700;padding-top:8px;">✓ 5% Pay-in-Full Courtesy Discount Applied</td>
          </tr>` : ''}
        </table>
      </div>` : ''}

      <!-- Next steps -->
      <div style="background:#f9f7f3;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="color:#0a1628;font-size:13px;font-weight:700;margin-bottom:12px;">Next Steps</div>
        <div style="color:#4b5563;font-size:13px;line-height:1.8;">
          ✓ Review your proposal carefully<br/>
          ✓ Contact our office to schedule your pre-operative appointment<br/>
          ✓ Finalize your financing selection<br/>
          ✓ Complete your medical history forms
        </div>
      </div>

      <p style="color:#6b7280;font-size:11px;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:20px;margin:0;">
        This proposal is an estimate valid for 90 days and is subject to change based on final surgical planning.
        This communication is confidential and intended solely for the addressee.
        If you received this in error, please notify our office immediately.
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#0a1628;padding:16px 36px;text-align:center;">
      <div style="color:rgba(255,255,255,0.4);font-size:11px;">${req.facilityName} · Powered by <span style="color:#c9a96e;font-weight:700;">PatientTrac Revela</span></div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PROPOSAL_FROM_EMAIL ?? 'proposals@patienttrac-revela.com';

  if (!resendKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured. Set RESEND_API_KEY.' }) };
  }

  let body: SendProposalRequest;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!body.patientEmail || !body.facilityName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'patientEmail and facilityName are required' }) };
  }

  const html = buildEmailHtml(body);

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: `${body.facilityName} <${fromEmail}>`,
        to:   [body.patientEmail],
        subject: `Your Surgical Proposal — ${body.procedureName} at ${body.facilityName}`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend error:', data);
      return { statusCode: 502, body: JSON.stringify({ error: data?.message ?? 'Email delivery failed' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, messageId: data.id }),
    };
  } catch (err) {
    console.error('send-proposal error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email' }) };
  }
};
