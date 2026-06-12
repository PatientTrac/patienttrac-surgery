// ================================================================
// AI Enhanced Risk Assessment — calls the ai-risk-score Netlify
// function (Claude, anonymized parameters only) to augment the
// standard calculators with interaction analysis and optimization
// recommendations.
// ================================================================

import React, { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';

const C = {
  gold: '#c9a96e', navy: '#060e1c', text: '#e8eaf0',
  muted: '#8a9bc0', dim: '#3a4a6a', red: '#ef4444', amber: '#f59e0b', green: '#4ade80',
};

const LEVEL_COLOR: Record<string, string> = {
  low: C.green, moderate: C.amber, high: '#f97316', very_high: C.red,
};

interface RiskResult {
  enhanced_risk_level?: string;
  risk_confidence?: number | string;
  key_risk_drivers?: { factor: string; impact: string; modifiable: boolean; rationale: string }[];
  risk_interactions?: string[];
  preop_optimization?: { recommendation: string; urgency: string; evidence: string }[];
  intraop_alerts?: string[];
  pacu_monitoring?: string[];
  red_flags?: string[];
  summary?: string;
}

interface Props {
  clinicalParams: Record<string, unknown>;
  calculatedScores: Record<string, unknown>;
  specialty: string;
  procedureType?: string;
}

export default function AIRiskAssessment({ clinicalParams, calculatedScores, specialty, procedureType }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RiskResult | null>(null);
  const [err, setErr] = useState('');

  const run = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/.netlify/functions/ai-risk-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicalParams, calculatedScores, specialty, procedureType }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Server error ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: any) {
      setErr(e.message ?? 'AI assessment failed');
    }
    setLoading(false);
  };

  const list = (title: string, items?: string[], color = C.muted) =>
    items && items.length > 0 ? (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{title}</div>
        {items.map((t, i) => (
          <div key={i} style={{ color, fontSize: 12.5, padding: '2px 0', display: 'flex', gap: 7 }}>
            <span style={{ color: C.gold }}>•</span><span>{t}</span>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={run} disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            borderRadius: 8, border: '1px solid rgba(201,169,110,0.35)',
            background: 'rgba(201,169,110,0.12)', color: C.gold,
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1,
          }}>
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
          {loading ? 'Analyzing…' : 'AI Enhanced Risk Assessment'}
        </button>
        {result?.enhanced_risk_level && (
          <span style={{
            fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: LEVEL_COLOR[result.enhanced_risk_level] ?? C.text,
            border: `1px solid ${(LEVEL_COLOR[result.enhanced_risk_level] ?? C.text)}55`,
            borderRadius: 6, padding: '3px 10px',
          }}>
            {result.enhanced_risk_level.replace('_', ' ')} risk
          </span>
        )}
        <span style={{ color: C.dim, fontSize: 10.5, marginLeft: 'auto' }}>
          AI augmentation — clinical judgment prevails
        </span>
      </div>

      {err && (
        <div style={{ color: C.red, fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} /> {err}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          {result.summary && <div style={{ color: C.text, fontSize: 13, lineHeight: 1.55 }}>{result.summary}</div>}

          {result.red_flags && result.red_flags.length > 0 && (
            <div style={{ marginTop: 10, border: `1px solid rgba(239,68,68,0.4)`, background: 'rgba(239,68,68,0.07)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ color: C.red, fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <ShieldAlert size={13} /> RED FLAGS
              </div>
              {result.red_flags.map((t, i) => (
                <div key={i} style={{ color: C.text, fontSize: 12.5, padding: '2px 0' }}>{t}</div>
              ))}
            </div>
          )}

          {result.key_risk_drivers && result.key_risk_drivers.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Key risk drivers</div>
              {result.key_risk_drivers.map((d, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: '3px 0', color: C.text }}>
                  <strong style={{ color: d.impact === 'high' ? C.red : d.impact === 'medium' ? C.amber : C.muted }}>
                    {d.factor}
                  </strong>
                  {d.modifiable && <span style={{ color: C.green, fontSize: 10.5, marginLeft: 6 }}>modifiable</span>}
                  <span style={{ color: C.muted }}> — {d.rationale}</span>
                </div>
              ))}
            </div>
          )}

          {result.preop_optimization && result.preop_optimization.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: C.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Pre-op optimization</div>
              {result.preop_optimization.map((o, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: '2px 0', color: C.text }}>
                  <span style={{ color: o.urgency === 'before_surgery' ? C.red : o.urgency === 'within_week' ? C.amber : C.muted, fontSize: 10.5, fontWeight: 700, marginRight: 6, textTransform: 'uppercase' }}>
                    {o.urgency?.replace(/_/g, ' ')}
                  </span>
                  {o.recommendation}
                  <span style={{ color: C.dim }}> ({o.evidence})</span>
                </div>
              ))}
            </div>
          )}

          {list('Risk interactions', result.risk_interactions, C.text)}
          {list('Intra-op alerts (anesthesia team)', result.intraop_alerts, C.text)}
          {list('PACU monitoring', result.pacu_monitoring, C.text)}
        </div>
      )}
    </div>
  );
}
