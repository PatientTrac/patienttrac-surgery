// ================================================================
// AI Documentation Tools — Phase C wiring for the remaining AI
// functions over the operative note:
//   · ai-dictation-cleanup — normalize dictated text in place
//   · ai-icd-cpt           — ICD-10-CM / CPT coding suggestions
//   · ai-registry-extract  — registry submission readiness check
// ================================================================

import React, { useState } from 'react';
import { Sparkles, Loader2, Wand2, FileSearch, ClipboardCheck, AlertTriangle } from 'lucide-react';

const C = {
  gold: '#c9a96e', navy: '#060e1c', card: '#0a1628',
  text: '#e8eaf0', muted: '#8a9bc0', dim: '#3a4a6a',
  red: '#ef4444', amber: '#f59e0b', green: '#4ade80',
};

const REGISTRIES = ['ACS NSQIP', 'GIQuIC (endoscopy)', 'AJRR (arthroplasty)', 'SVS VQI (vascular)'];

interface CodeRow { code: string; description: string; confidence?: number; laterality?: string; notes?: string }
interface RegistryResult {
  extracted_fields?: Record<string, unknown>;
  missing_required_fields?: string[];
  data_quality_flags?: { field: string; issue: string }[];
  completeness_pct?: number;
  submission_ready?: boolean;
}

interface Props {
  findings: string;
  description: string;
  onFindingsCleaned: (text: string) => void;
  onDescriptionCleaned: (text: string) => void;
  specialty: string;
  procedureType?: string;
  formData: Record<string, unknown>;
  encounterId: string;
}

async function post(fn: string, payload: unknown) {
  const res = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? `Server error ${res.status}`);
  }
  return res.json();
}

const btn = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 7, border: '1px solid rgba(201,169,110,0.3)',
  background: 'rgba(201,169,110,0.08)', color: C.gold,
  fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

export default function AIDocTools({
  findings, description, onFindingsCleaned, onDescriptionCleaned,
  specialty, procedureType, formData, encounterId,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [codes, setCodes] = useState<{ icd10: CodeRow[]; cpt: CodeRow[] } | null>(null);
  const [registry, setRegistry] = useState(REGISTRIES[0]);
  const [regResult, setRegResult] = useState<RegistryResult | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr('');
    try { await fn(); } catch (e: any) { setErr(e.message ?? 'AI request failed'); }
    setBusy(null);
  };

  const cleanFindings = () => run('findings', async () => {
    const r = await post('ai-dictation-cleanup', { text: findings, clinicalContext: 'Intraoperative findings, operative note' });
    if (r.cleaned) onFindingsCleaned(r.cleaned);
  });

  const cleanDescription = () => run('description', async () => {
    const r = await post('ai-dictation-cleanup', { text: description, clinicalContext: 'Procedure details narrative, operative note' });
    if (r.cleaned) onDescriptionCleaned(r.cleaned);
  });

  const suggestCodes = () => run('codes', async () => {
    const r = await post('ai-icd-cpt', {
      description: description || 'No narrative yet',
      findings: findings || undefined,
      specialty,
      procedureType,
    });
    setCodes({ icd10: r.icd10 ?? [], cpt: r.cpt ?? [] });
  });

  const checkRegistry = () => run('registry', async () => {
    const r = await post('ai-registry-extract', { formData, registry, encounterId });
    setRegResult(r);
  });

  const codeChip = (r: CodeRow, kind: 'icd10' | 'cpt') => (
    <div key={`${kind}-${r.code}`} title={r.notes}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 7, margin: '3px 6px 3px 0',
        border: '1px solid rgba(201,169,110,0.3)', borderRadius: 7, padding: '5px 10px',
        background: 'rgba(201,169,110,0.06)',
      }}>
      <span style={{ color: C.gold, fontFamily: 'DM Mono,monospace', fontSize: 12.5, fontWeight: 700 }}>{r.code}</span>
      <span style={{ color: C.text, fontSize: 12 }}>{r.description}</span>
      {typeof r.confidence === 'number' && (
        <span style={{ color: r.confidence >= 0.8 ? C.green : r.confidence >= 0.5 ? C.amber : C.red, fontSize: 10.5 }}>
          {Math.round(r.confidence * 100)}%
        </span>
      )}
    </div>
  );

  return (
    <div style={{ border: '1px solid rgba(201,169,110,0.2)', background: C.card, borderRadius: 10, padding: '14px 16px', marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <Sparkles size={17} color={C.gold} />
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>AI Documentation Tools</span>
        <span style={{ color: C.dim, fontSize: 10.5 }}>Suggestions require clinician review before signing</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btn(!findings || busy !== null)} disabled={!findings || busy !== null} onClick={cleanFindings}>
          {busy === 'findings' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={13} />}
          Clean up findings
        </button>
        <button style={btn(!description || busy !== null)} disabled={!description || busy !== null} onClick={cleanDescription}>
          {busy === 'description' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={13} />}
          Clean up narrative
        </button>
        <button style={btn(!description || busy !== null)} disabled={!description || busy !== null} onClick={suggestCodes}>
          {busy === 'codes' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSearch size={13} />}
          Suggest ICD-10 / CPT
        </button>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <select value={registry} onChange={e => setRegistry(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 7, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none',
            }}>
            {REGISTRIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={btn(busy !== null)} disabled={busy !== null} onClick={checkRegistry}>
            {busy === 'registry' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ClipboardCheck size={13} />}
            Registry readiness
          </button>
        </span>
      </div>

      {err && (
        <div style={{ color: C.red, fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} /> {err}
        </div>
      )}

      {codes && (
        <div style={{ marginTop: 12 }}>
          {codes.icd10.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>ICD-10-CM</div>
              {codes.icd10.map(r => codeChip(r, 'icd10'))}
            </div>
          )}
          {codes.cpt.length > 0 && (
            <div>
              <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>CPT</div>
              {codes.cpt.map(r => codeChip(r, 'cpt'))}
            </div>
          )}
          {codes.icd10.length === 0 && codes.cpt.length === 0 && (
            <div style={{ color: C.muted, fontSize: 12 }}>No codes suggested — add more narrative detail.</div>
          )}
        </div>
      )}

      {regResult && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: regResult.submission_ready ? C.green : C.amber,
              border: `1px solid ${(regResult.submission_ready ? C.green : C.amber)}55`,
              borderRadius: 6, padding: '3px 10px',
            }}>
              {regResult.submission_ready ? 'Submission ready' : 'Not yet submission-ready'}
            </span>
            {typeof regResult.completeness_pct === 'number' && (
              <span style={{ color: C.muted, fontSize: 12 }}>{regResult.completeness_pct}% complete</span>
            )}
          </div>
          {regResult.missing_required_fields && regResult.missing_required_fields.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Missing required fields</div>
              <div style={{ color: C.text, fontSize: 12.5 }}>{regResult.missing_required_fields.join(' · ')}</div>
            </div>
          )}
          {regResult.data_quality_flags && regResult.data_quality_flags.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Data quality flags</div>
              {regResult.data_quality_flags.map((f, i) => (
                <div key={i} style={{ color: C.muted, fontSize: 12.5, padding: '2px 0' }}>
                  <strong style={{ color: C.amber }}>{f.field}:</strong> {f.issue}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
