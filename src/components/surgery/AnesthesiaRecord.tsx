// ================================================================
// Anesthesia Record — pre-anesthesia evaluation + intra-op record.
// Eval/airway/fluids persist as a versioned anesthesia_record note
// (cr.patient_notes); anesthesia type & times write to the shared
// case spine (cr.or_cases); serial vitals write to cr.case_vitals
// where the OR app's live console reads them.
// ================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Stethoscope, Save, Loader2, CheckCircle2, Activity, Plus, Wind } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const C = {
  gold: '#c9a96e', navy: '#060e1c', card: '#0a1628',
  text: '#e8eaf0', muted: '#8a9bc0', dim: '#3a4a6a',
  red: '#ef4444', green: '#4ade80',
};

const ASA = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const MALLAMPATI = ['I', 'II', 'III', 'IV'];
const ANESTHESIA_TYPES = ['General — ETT', 'General — LMA', 'MAC / Sedation', 'Spinal', 'Epidural', 'Regional block', 'Local'];
const STOP_BANG: { key: string; label: string }[] = [
  { key: 'snoring', label: 'Snoring' }, { key: 'tired', label: 'Daytime tiredness' },
  { key: 'observed', label: 'Observed apnea' }, { key: 'pressure', label: 'Hypertension' },
  { key: 'bmi', label: 'BMI > 35' }, { key: 'age', label: 'Age > 50' },
  { key: 'neck', label: 'Neck > 40 cm' }, { key: 'gender', label: 'Male' },
];
const RCRI: { key: string; label: string }[] = [
  { key: 'highRiskSurgery', label: 'High-risk surgery' }, { key: 'ischemic', label: 'Ischemic heart disease' },
  { key: 'chf', label: 'CHF history' }, { key: 'cva', label: 'CVA / TIA history' },
  { key: 'insulin', label: 'Insulin therapy' }, { key: 'creatinine', label: 'Creatinine > 2 mg/dL' },
];

interface AnesthesiaData {
  eval: {
    asaClass: string; asaE: boolean;
    mallampati: string; npoHours: string; mets: '' | '<4' | '>=4' | 'unknown';
    stopBang: Record<string, boolean>;
    rcri: Record<string, boolean>;
    airwayNotes: string; plannedType: string;
  };
  intraOp: {
    actualType: string; startTime: string; endTime: string;
    airwayDevice: string; deviceSize: string; blade: string;
    attempts: string; difficultAirway: boolean;
    crystalloidMl: string; colloidMl: string; eblMl: string; urineMl: string;
  };
}

const blankData: AnesthesiaData = {
  eval: {
    asaClass: '', asaE: false, mallampati: '', npoHours: '', mets: '',
    stopBang: {}, rcri: {}, airwayNotes: '', plannedType: '',
  },
  intraOp: {
    actualType: '', startTime: '', endTime: '',
    airwayDevice: '', deviceSize: '', blade: '', attempts: '', difficultAirway: false,
    crystalloidMl: '', colloidMl: '', eblMl: '', urineMl: '',
  },
};

interface VitalRow {
  vital_id: number; recorded_at: string;
  heart_rate: number | null; blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null; oxygen_saturation: number | null;
  respiratory_rate: number | null; temperature: number | null;
}

interface Props {
  caseId: number | null;
  patientId: string | number;
  encounterId: string | number;
  orgId: string;
}

export default function AnesthesiaRecord({ caseId, patientId, encounterId, orgId }: Props) {
  const [data, setData] = useState<AnesthesiaData>(blankData);
  const [vitals, setVitals] = useState<VitalRow[]>([]);
  const [vform, setVform] = useState({ hr: '', sys: '', dia: '', spo2: '', rr: '', temp: '' });
  const [openSection, setOpenSection] = useState<'eval' | 'intraop' | null>('eval');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [err, setErr] = useState('');

  // Load latest record + vitals
  useEffect(() => {
    (async () => {
      const { data: rows } = await (supabase as any)
        .schema('cr').from('patient_notes')
        .select('note_text')
        .eq('encounter_id', encounterId)
        .eq('note_type', 'anesthesia_record')
        .order('created_at', { ascending: false })
        .limit(1);
      if (rows?.[0]?.note_text) {
        try {
          const parsed = JSON.parse(rows[0].note_text);
          setData(prev => ({
            eval: { ...prev.eval, ...(parsed.eval ?? {}) },
            intraOp: { ...prev.intraOp, ...(parsed.intraOp ?? {}) },
          }));
        } catch { /* keep defaults */ }
      }
    })();
  }, [encounterId]);

  const loadVitals = useCallback(async () => {
    if (!caseId) return;
    const { data: v } = await supabase
      .from('case_vitals')
      .select('vital_id, recorded_at, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, respiratory_rate, temperature')
      .eq('case_id', caseId)
      .order('recorded_at', { ascending: false })
      .limit(8);
    setVitals((v as VitalRow[]) ?? []);
  }, [caseId]);

  useEffect(() => { loadVitals(); }, [loadVitals]);

  const stopBangScore = STOP_BANG.filter(i => data.eval.stopBang[i.key]).length;
  const rcriScore = RCRI.filter(i => data.eval.rcri[i.key]).length;

  const save = useCallback(async () => {
    setSaving(true); setErr(''); setSavedMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).schema('cr').from('patient_notes').insert({
        org_id: orgId, patient_id: patientId, encounter_id: encounterId,
        note_type: 'anesthesia_record',
        note_text: JSON.stringify({ ...data, scores: { stopBang: stopBangScore, rcri: rcriScore } }),
        created_by: user?.id ?? null,
      });
      // Anesthesia type & times live on the shared case spine
      if (caseId && (data.intraOp.actualType || data.intraOp.startTime || data.intraOp.endTime)) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from('or_cases').update({
          anesthesia_type: data.intraOp.actualType || null,
          anesthesia_start_time: data.intraOp.startTime ? `${today}T${data.intraOp.startTime}:00Z` : null,
          anesthesia_end_time: data.intraOp.endTime ? `${today}T${data.intraOp.endTime}:00Z` : null,
        }).eq('case_id', caseId);
      }
      setSavedMsg('Anesthesia record saved');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e: any) {
      setErr(e.message ?? 'Save failed');
    }
    setSaving(false);
  }, [data, caseId, patientId, encounterId, orgId, stopBangScore, rcriScore]);

  const addVitals = useCallback(async () => {
    if (!caseId) return;
    const hasAny = Object.values(vform).some(v => v !== '');
    if (!hasAny) return;
    setErr('');
    try {
      const { error } = await supabase.from('case_vitals').insert({
        case_id: caseId, org_id: orgId,
        recorded_at: new Date().toISOString(),
        heart_rate: vform.hr ? Number(vform.hr) : null,
        blood_pressure_systolic: vform.sys ? Number(vform.sys) : null,
        blood_pressure_diastolic: vform.dia ? Number(vform.dia) : null,
        oxygen_saturation: vform.spo2 ? Number(vform.spo2) : null,
        respiratory_rate: vform.rr ? Number(vform.rr) : null,
        temperature: vform.temp ? Number(vform.temp) : null,
        is_critical: vform.spo2 !== '' && Number(vform.spo2) < 90,
      });
      if (error) throw error;
      setVform({ hr: '', sys: '', dia: '', spo2: '', rr: '', temp: '' });
      await loadVitals();
    } catch (e: any) {
      setErr(e.message ?? 'Could not record vitals');
    }
  }, [caseId, orgId, vform, loadVitals]);

  const setEval = (patch: Partial<AnesthesiaData['eval']>) =>
    setData(d => ({ ...d, eval: { ...d.eval, ...patch } }));
  const setIntra = (patch: Partial<AnesthesiaData['intraOp']>) =>
    setData(d => ({ ...d, intraOp: { ...d.intraOp, ...patch } }));

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 12.5, outline: 'none',
  };
  const lbl: React.CSSProperties = { color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 };
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${on ? 'rgba(201,169,110,0.5)' : 'rgba(255,255,255,0.12)'}`,
    background: on ? 'rgba(201,169,110,0.18)' : 'rgba(255,255,255,0.04)',
    color: on ? C.gold : C.muted,
  });

  return (
    <div style={{ border: '1px solid rgba(201,169,110,0.2)', background: C.card, borderRadius: 10, padding: '14px 16px', marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Stethoscope size={17} color={C.gold} />
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Anesthesia Record</span>
        {data.eval.asaClass && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, border: '1px solid rgba(201,169,110,0.35)', borderRadius: 5, padding: '2px 8px' }}>
            ASA {data.eval.asaClass}{data.eval.asaE ? 'E' : ''}
          </span>
        )}
        <span style={{ color: C.dim, fontSize: 11 }}>STOP-BANG {stopBangScore}/8 · RCRI {rcriScore}/6</span>
        <button onClick={save} disabled={saving}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, border: 'none', background: C.gold, color: C.navy, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : savedMsg ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {savedMsg || 'Save Record'}
        </button>
      </div>
      {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([['eval', 'Pre-Anesthesia Evaluation'], ['intraop', 'Intra-Op Record']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setOpenSection(openSection === k ? null : k)} style={chip(openSection === k)}>{t}</button>
        ))}
      </div>

      {openSection === 'eval' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <span style={lbl}>ASA Class</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {ASA.map(a => (
                  <button key={a} style={chip(data.eval.asaClass === a)} onClick={() => setEval({ asaClass: a })}>{a}</button>
                ))}
                <button style={chip(data.eval.asaE)} onClick={() => setEval({ asaE: !data.eval.asaE })}>E</button>
              </div>
            </div>
            <div>
              <span style={lbl}>Mallampati</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {MALLAMPATI.map(m => (
                  <button key={m} style={chip(data.eval.mallampati === m)} onClick={() => setEval({ mallampati: m })}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <span style={lbl}>Functional capacity</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['<4', '>=4', 'unknown'] as const).map(m => (
                  <button key={m} style={chip(data.eval.mets === m)} onClick={() => setEval({ mets: m })}>
                    {m === '<4' ? '< 4 METs' : m === '>=4' ? '≥ 4 METs' : 'Unknown'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span style={lbl}>NPO (hours)</span>
              <input style={{ ...inp, width: 80 }} type="number" min="0" value={data.eval.npoHours}
                onChange={e => setEval({ npoHours: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <span style={lbl}>STOP-BANG (OSA risk) — {stopBangScore}/8</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {STOP_BANG.map(i => (
                  <button key={i.key} style={chip(!!data.eval.stopBang[i.key])}
                    onClick={() => setEval({ stopBang: { ...data.eval.stopBang, [i.key]: !data.eval.stopBang[i.key] } })}>
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span style={lbl}>RCRI (cardiac risk) — {rcriScore}/6</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {RCRI.map(i => (
                  <button key={i.key} style={chip(!!data.eval.rcri[i.key])}
                    onClick={() => setEval({ rcri: { ...data.eval.rcri, [i.key]: !data.eval.rcri[i.key] } })}>
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <span style={lbl}>Planned anesthesia</span>
              <select style={{ ...inp, width: '100%' }} value={data.eval.plannedType}
                onChange={e => setEval({ plannedType: e.target.value })}>
                <option value="">Select…</option>
                {ANESTHESIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <span style={lbl}>Airway notes (dentition, neck ROM, thyromental)</span>
              <input style={{ ...inp, width: '100%' }} value={data.eval.airwayNotes}
                onChange={e => setEval({ airwayNotes: e.target.value })} placeholder="e.g., full dentition, TMD > 3 FB, full neck ROM" />
            </div>
          </div>
        </div>
      )}

      {openSection === 'intraop' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <span style={lbl}>Anesthesia type (actual)</span>
              <select style={{ ...inp, minWidth: 170 }} value={data.intraOp.actualType}
                onChange={e => setIntra({ actualType: e.target.value })}>
                <option value="">Select…</option>
                {ANESTHESIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <span style={lbl}>Start</span>
              <input style={inp} type="time" value={data.intraOp.startTime} onChange={e => setIntra({ startTime: e.target.value })} />
            </div>
            <div>
              <span style={lbl}>End</span>
              <input style={inp} type="time" value={data.intraOp.endTime} onChange={e => setIntra({ endTime: e.target.value })} />
            </div>
            <div>
              <span style={lbl}>Airway device / size</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select style={inp} value={data.intraOp.airwayDevice} onChange={e => setIntra({ airwayDevice: e.target.value })}>
                  <option value="">—</option>
                  <option>ETT</option><option>LMA</option><option>Mask</option><option>Nasal cannula</option>
                </select>
                <input style={{ ...inp, width: 64 }} placeholder="Size" value={data.intraOp.deviceSize}
                  onChange={e => setIntra({ deviceSize: e.target.value })} />
              </div>
            </div>
            <div>
              <span style={lbl}>Blade / attempts</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...inp, width: 80 }} placeholder="Mac 3…" value={data.intraOp.blade}
                  onChange={e => setIntra({ blade: e.target.value })} />
                <input style={{ ...inp, width: 56 }} type="number" min="1" placeholder="#" value={data.intraOp.attempts}
                  onChange={e => setIntra({ attempts: e.target.value })} />
              </div>
            </div>
            <button style={chip(data.intraOp.difficultAirway)} onClick={() => setIntra({ difficultAirway: !data.intraOp.difficultAirway })}>
              <Wind size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />Difficult airway
            </button>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {([['crystalloidMl', 'Crystalloid (mL)'], ['colloidMl', 'Colloid (mL)'], ['eblMl', 'EBL (mL)'], ['urineMl', 'Urine output (mL)']] as const).map(([k, t]) => (
              <div key={k}>
                <span style={lbl}>{t}</span>
                <input style={{ ...inp, width: 110 }} type="number" min="0" value={data.intraOp[k]}
                  onChange={e => setIntra({ [k]: e.target.value } as any)} />
              </div>
            ))}
          </div>

          {/* Serial vitals — shared with the OR live console */}
          <div>
            <span style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={12} color={C.gold} /> Vitals log (live on the OR console)
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              {([['hr', 'HR'], ['sys', 'SBP'], ['dia', 'DBP'], ['spo2', 'SpO₂'], ['rr', 'RR'], ['temp', 'Temp °C']] as const).map(([k, p]) => (
                <input key={k} style={{ ...inp, width: 70 }} placeholder={p} type="number" value={vform[k]}
                  onChange={e => setVform(f => ({ ...f, [k]: e.target.value }))} />
              ))}
              <button onClick={addVitals}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(201,169,110,0.3)', background: 'rgba(201,169,110,0.1)', color: C.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={12} /> Log
              </button>
            </div>
            {vitals.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: C.dim, textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    <th style={{ padding: '3px 6px' }}>Time</th><th style={{ padding: '3px 6px' }}>HR</th>
                    <th style={{ padding: '3px 6px' }}>BP</th><th style={{ padding: '3px 6px' }}>SpO₂</th>
                    <th style={{ padding: '3px 6px' }}>RR</th><th style={{ padding: '3px 6px' }}>Temp</th>
                  </tr>
                </thead>
                <tbody>
                  {vitals.map(v => (
                    <tr key={v.vital_id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: C.text }}>
                      <td style={{ padding: '4px 6px', color: C.muted, fontFamily: 'DM Mono,monospace' }}>
                        {new Date(v.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '4px 6px' }}>{v.heart_rate ?? '—'}</td>
                      <td style={{ padding: '4px 6px' }}>{v.blood_pressure_systolic ?? '—'}/{v.blood_pressure_diastolic ?? '—'}</td>
                      <td style={{ padding: '4px 6px', color: (v.oxygen_saturation ?? 100) < 90 ? C.red : C.text }}>{v.oxygen_saturation ?? '—'}%</td>
                      <td style={{ padding: '4px 6px' }}>{v.respiratory_rate ?? '—'}</td>
                      <td style={{ padding: '4px 6px' }}>{v.temperature ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
