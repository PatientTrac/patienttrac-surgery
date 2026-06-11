import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Loader2, AlertTriangle, PenTool, X } from 'lucide-react';

interface ConsentData {
  consent_id:         string;
  patient_first_name: string;
  patient_last_name:  string;
  procedure_name:     string;
  surgeon_name:       string;
  facility_name:      string;
  status:             string;
}

interface TemplateData {
  template_name:      string;
  consent_statement:  string;
  risks_general:      string[];
  risks_specific:     string[];
  risks_anesthesia:   string[];
  benefits:           string[];
  alternatives:       string[];
  no_guarantee_clause?: string;
  photography_clause?:  string;
  revision_policy?:     string;
}

type Phase = 'loading' | 'error' | 'form' | 'signed' | 'already_signed';

const GOLD  = '#c9a96e';
const NAVY  = '#0a1628';

// ── Canvas Signature Pad ─────────────────────────────────────────────────────
function SignaturePad({ onCapture, onClear }: { onCapture: (url: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'clientX' in e ? e.clientX : (e as Touch).clientX;
    const clientY = 'clientY' in e ? e.clientY : (e as Touch).clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }, []);

  const draw = useCallback((x: number, y: number) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#0a1628';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  }, []);

  const endDraw = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCapture(canvas.toDataURL('image/png'));
  }, [onCapture]);

  const clearPad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onClear();
  }, [onClear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => { const p = getPos(e, canvas); startDraw(p.x, p.y); };
    const onMouseMove = (e: MouseEvent) => { const p = getPos(e, canvas); draw(p.x, p.y); };
    const onMouseUp   = () => endDraw();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const p = getPos(e.touches[0], canvas);
      startDraw(p.x, p.y);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const p = getPos(e.touches[0], canvas);
      draw(p.x, p.y);
    };
    const onTouchEnd = () => endDraw();

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove,  { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [startDraw, draw, endDraw]);

  return (
    <div>
      <div style={{ position: 'relative', border: '2px solid #d1d5db', borderRadius: 12, background: '#fafaf8', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={160}
          style={{ width: '100%', height: 160, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        />
        {!hasStroke && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af' }}>
              <PenTool size={16} />
              <span style={{ fontSize: 14 }}>Sign here using your finger or stylus</span>
            </div>
          </div>
        )}
        {/* Signature line */}
        <div style={{ position: 'absolute', bottom: 28, left: 24, right: 24, borderBottom: '1px solid #d1d5db', pointerEvents: 'none' }} />
      </div>
      {hasStroke && (
        <button onClick={clearPad} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
          <X size={12} /> Clear signature
        </button>
      )}
    </div>
  );
}

// ── Agreement Checkbox ────────────────────────────────────────────────────────
function AgreementCheck({ id, label, description, checked, onChange, required }: {
  id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; required?: boolean;
}) {
  return (
    <label htmlFor={id} style={{ display: 'flex', gap: 14, cursor: 'pointer', padding: '14px 16px', background: checked ? '#f0fdf4' : '#fafaf8', border: `1.5px solid ${checked ? '#86efac' : '#e5e7eb'}`, borderRadius: 10, transition: 'all 0.15s' }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ display: 'none' }} />
        <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? '#16a34a' : '#d1d5db'}`, background: checked ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
          {checked && <Check size={13} color="#fff" strokeWidth={3} />}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#0a1628', fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
          {label} {required && <span style={{ color: '#dc2626' }}>*</span>}
        </div>
        {description && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{description}</div>}
      </div>
    </label>
  );
}

// ── Risk List ─────────────────────────────────────────────────────────────────
function RiskList({ items, color = '#374151' }: { items: string[]; color?: string }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: '8px 0 0 0', padding: '0 0 0 18px', listStyleType: 'disc' }}>
      {items.map((item, i) => (
        <li key={i} style={{ color, fontSize: 13, lineHeight: 1.6, marginBottom: 3 }}>{item}</li>
      ))}
    </ul>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function Section({ title, children, accent = false }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ marginBottom: 24, background: '#fff', borderRadius: 12, border: `1px solid ${accent ? '#fde68a' : '#e5e7eb'}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '12px 20px', background: accent ? '#fffbeb' : '#f9fafb', borderBottom: `1px solid ${accent ? '#fde68a' : '#e5e7eb'}` }}>
        <h3 style={{ margin: 0, color: '#0a1628', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ConsentForm() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase]     = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);

  // Agreement states
  const [agreedToProcedure,  setAgreedToProcedure]  = useState(false);
  const [agreedToRisks,      setAgreedToRisks]      = useState(false);
  const [agreedToAnesthesia, setAgreedToAnesthesia] = useState(false);
  const [agreedToPhotos,     setAgreedToPhotos]     = useState(false);
  const [questions,          setQuestions]          = useState('');
  const [signatureDataUrl,   setSignatureDataUrl]   = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load consent data
  useEffect(() => {
    if (!token) { setPhase('error'); setErrorMsg('No consent token provided'); return; }

    fetch(`/.netlify/functions/consent-load?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Failed to load consent form');
          setPhase('error');
          return;
        }
        setConsent(data.consent);
        setTemplate(data.template);
        setPhase(data.alreadySigned ? 'already_signed' : 'form');
      })
      .catch(() => { setErrorMsg('Network error — please check your connection'); setPhase('error'); });
  }, [token]);

  const canSubmit = agreedToProcedure && agreedToRisks && !!signatureDataUrl;

  const handleSubmit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/.netlify/functions/consent-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          agreedToProcedure,
          agreedToRisks,
          agreedToAnesthesia,
          agreedToPhotos,
          patientQuestions: questions || null,
          signatureDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      setPhase('signed');
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${GOLD}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading consent form…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', border: '2px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} color="#dc2626" />
          </div>
          <h2 style={{ color: '#0a1628', fontSize: 22, margin: '0 0 8px' }}>Consent Form Unavailable</h2>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
          <p style={{ color: '#9ca3af', fontSize: 12 }}>Please contact your healthcare provider's office to obtain a new link.</p>
        </div>
      </div>
    );
  }

  // ── Already Signed ─────────────────────────────────────────────────────────
  if (phase === 'already_signed') {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={28} color="#16a34a" strokeWidth={2.5} />
          </div>
          <h2 style={{ color: '#0a1628', fontSize: 22, margin: '0 0 8px' }}>Already Signed</h2>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
            This consent form for <strong>{consent?.procedure_name}</strong> has already been signed.
            A confirmation was sent to your email.
          </p>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 16 }}>Contact {consent?.facility_name ?? 'your provider'} if you have questions.</p>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (phase === 'signed') {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', border: '3px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={36} color="#16a34a" strokeWidth={2.5} />
          </div>
          <h1 style={{ color: '#0a1628', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>Consent Signed</h1>
          <p style={{ color: '#374151', fontSize: 16, lineHeight: 1.7, margin: '0 0 20px' }}>
            Thank you, <strong>{consent?.patient_first_name}</strong>. Your informed consent for <strong>{consent?.procedure_name}</strong> has been securely recorded.
          </p>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20, textAlign: 'left' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Procedure', value: consent?.procedure_name },
                { label: 'Provider', value: consent?.surgeon_name },
                { label: 'Facility', value: consent?.facility_name },
                { label: 'Signed', value: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
              ].filter(r => r.value).map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#9ca3af', fontWeight: 600 }}>{row.label}</span>
                  <span style={{ color: '#0a1628', fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: '#6b7280', fontSize: 12 }}>A confirmation has been sent to your email address. You may now close this window.</p>
        </div>
      </div>
    );
  }

  // ── Consent Form ───────────────────────────────────────────────────────────
  const t = template;
  const c = consent!;
  const patientName = `${c.patient_first_name} ${c.patient_last_name}`;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; }`}</style>

      {/* Header */}
      <div style={{ background: NAVY, borderBottom: `3px solid ${GOLD}` }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{c.facility_name}</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Informed Consent Form</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>Patient</div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{patientName}</div>
          </div>
        </div>
      </div>

      {/* Patient + procedure banner */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 24px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Procedure', value: c.procedure_name },
            { label: 'Surgeon', value: c.surgeon_name },
            { label: 'Date', value: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
          ].filter(r => r.value).map(row => (
            <div key={row.label}>
              <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{row.label}</div>
              <div style={{ color: '#0a1628', fontSize: 13, fontWeight: 600, marginTop: 2 }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 24px 40px' }}>

        {/* Important notice */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 10 }}>
          <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: '#92400e', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            <strong>Please read this entire document carefully</strong> before signing. This form explains the nature, risks, and alternatives of your procedure. Take as much time as you need.
          </p>
        </div>

        {/* Consent statement */}
        {t?.consent_statement && (
          <Section title="Consent Statement">
            <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{t.consent_statement}</p>
          </Section>
        )}

        {/* Benefits */}
        {t?.benefits?.length > 0 && (
          <Section title="Expected Benefits">
            <RiskList items={t.benefits} color="#15803d" />
          </Section>
        )}

        {/* Risks */}
        {(t?.risks_general?.length > 0 || t?.risks_specific?.length > 0) && (
          <Section title="Risks and Potential Complications" accent>
            {t?.risks_general?.length > 0 && (
              <>
                <div style={{ color: '#374151', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>General Surgical Risks</div>
                <RiskList items={t.risks_general} color="#374151" />
              </>
            )}
            {t?.risks_specific?.length > 0 && (
              <>
                <div style={{ color: '#374151', fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>Procedure-Specific Risks</div>
                <RiskList items={t.risks_specific} color="#374151" />
              </>
            )}
          </Section>
        )}

        {/* Anesthesia */}
        {t?.risks_anesthesia?.length > 0 && (
          <Section title="Anesthesia Risks">
            <RiskList items={t.risks_anesthesia} color="#374151" />
          </Section>
        )}

        {/* Alternatives */}
        {t?.alternatives?.length > 0 && (
          <Section title="Alternatives to Surgery">
            <RiskList items={t.alternatives} color="#374151" />
          </Section>
        )}

        {/* Clauses */}
        {(t?.no_guarantee_clause || t?.photography_clause || t?.revision_policy) && (
          <Section title="Additional Terms">
            {t.no_guarantee_clause && (
              <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.7, marginBottom: t.photography_clause || t.revision_policy ? 12 : 0 }}><strong>No Guarantee:</strong> {t.no_guarantee_clause}</p>
            )}
            {t.photography_clause && (
              <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.7, marginBottom: t.revision_policy ? 12 : 0 }}><strong>Photography:</strong> {t.photography_clause}</p>
            )}
            {t.revision_policy && (
              <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.7, margin: 0 }}><strong>Revision Policy:</strong> {t.revision_policy}</p>
            )}
          </Section>
        )}

        {/* Patient questions */}
        <Section title="Questions or Concerns">
          <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 10px' }}>
            Use this space to note any questions you'd like to discuss with your surgeon before proceeding.
          </p>
          <textarea
            value={questions}
            onChange={e => setQuestions(e.target.value)}
            placeholder="Optional — any questions or concerns about this procedure…"
            rows={3}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#374151', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </Section>

        {/* Agreement checkboxes */}
        <Section title="Your Agreement">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AgreementCheck
              id="agree_procedure"
              label="I consent to the proposed procedure"
              description={`I consent to ${c.procedure_name} and any additional procedures deemed necessary by my surgeon during the operation.`}
              checked={agreedToProcedure}
              onChange={setAgreedToProcedure}
              required
            />
            <AgreementCheck
              id="agree_risks"
              label="I understand the risks and complications"
              description="I have read and understood the risks, potential complications, and alternatives described in this document."
              checked={agreedToRisks}
              onChange={setAgreedToRisks}
              required
            />
            <AgreementCheck
              id="agree_anesthesia"
              label="I consent to anesthesia"
              description="I consent to the administration of anesthesia as deemed appropriate by the anesthesia team."
              checked={agreedToAnesthesia}
              onChange={setAgreedToAnesthesia}
            />
            {t?.photography_clause && (
              <AgreementCheck
                id="agree_photos"
                label="I consent to medical photography"
                description="I authorize photographs/video to be taken before, during, and after my procedure for medical record and educational purposes."
                checked={agreedToPhotos}
                onChange={setAgreedToPhotos}
              />
            )}
          </div>
        </Section>

        {/* Signature */}
        <div style={{ background: '#fff', borderRadius: 12, border: `2px solid ${GOLD}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ padding: '12px 20px', background: '#fffbeb', borderBottom: `1px solid ${GOLD}` }}>
            <h3 style={{ margin: 0, color: NAVY, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Patient Signature <span style={{ color: '#dc2626' }}>*</span>
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6, margin: '0 0 14px' }}>
              By signing below, <strong>{patientName}</strong>, I confirm that I have read, understood, and voluntarily agree to all terms of this consent form. I have had the opportunity to ask questions and all my questions have been answered to my satisfaction.
            </p>
            <SignaturePad
              onCapture={url => setSignatureDataUrl(url)}
              onClear={() => setSignatureDataUrl('')}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
              <span>{patientName}</span>
              <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Validation hint */}
        {!canSubmit && (
          <div style={{ background: '#fef9ee', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
            {!agreedToProcedure || !agreedToRisks
              ? '⚠ Please agree to the procedure and risks (required) before signing.'
              : '⚠ Please provide your signature above.'}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            width: '100%', padding: '15px 24px', borderRadius: 10,
            background: canSubmit ? GOLD : '#d1d5db',
            color: canSubmit ? NAVY : '#9ca3af',
            border: 'none', fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s',
          }}
        >
          {submitting
            ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> Submitting…</>
            : <><Check size={18} /> Submit Signed Consent</>}
        </button>
        {submitError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{submitError}</p>}

        {/* Legal footer */}
        <p style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
          This electronic consent is legally binding under applicable federal and state law.
          Your signature, IP address, timestamp, and device information are recorded for audit purposes.
          Powered by PatientTrac Revela.
        </p>
      </div>
    </div>
  );
}
