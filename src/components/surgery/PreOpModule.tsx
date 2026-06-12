// ================================================================
// PatientTrac Surgery — Pre-Operative Documentation Module
// Dark navy/gold theme matching Revela design system
// ================================================================

import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ChevronDown, ChevronRight, Save, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, Activity, ClipboardList,
  FlaskConical, Stethoscope, PenLine, CheckSquare, Square,
  Calculator, ShieldCheck,
} from 'lucide-react';

// Lazy: fabric.js canvas + anatomy templates only load when the
// surgeon opens the drawing tool.
const SurgicalDrawingTool = React.lazy(() => import('../SurgicalDrawingTool'));
import AIRiskAssessment from './AIRiskAssessment';

// ── Props ────────────────────────────────────────────────────────
interface Props {
  patientId: string | number;
  encounterId: string | number;
  orgId: string;
  onComplete?: () => void;
}

// ── Sub-types ────────────────────────────────────────────────────
type LabStatus = 'pending' | 'ordered' | 'resulted' | 'normal' | 'abnormal';
type ImagingStatus = 'pending' | 'ordered' | 'completed' | 'reviewed';
type ClearanceStatus = 'pending' | 'requested' | 'cleared' | 'conditional' | 'not_required';

interface LabPanel {
  ordered: boolean;
  status: LabStatus;
  value: string;
}

interface ImagingItem {
  ordered: boolean;
  status: ImagingStatus;
  date: string;
  notes: string;
}

interface SpecialistClearance {
  needed: boolean;
  status: ClearanceStatus;
  notes: string;
  date: string;
}

interface PreOpData {
  // Section 1 — Structured Assessment
  history: {
    chiefComplaint: string;
    hpi: string;
    pmh: string;
    psh: string;
    medications: string;
    allergies: string;
    ros: string;
  };
  physical: {
    bpSystolic: string;
    bpDiastolic: string;
    hr: string;
    rr: string;
    temp: string;
    spo2: string;
    mallampati: '' | 'I' | 'II' | 'III' | 'IV';
    cardio: string;
    pulmonary: string;
    abdomen: string;
    other: string;
  };
  comorbidities: {
    dm: boolean;
    dmType: 'type1' | 'type2' | '';
    htn: boolean;
    cad: boolean;
    ckd: boolean;
    ckdStage: string;
    copd: boolean;
    obesity: boolean;
    dvtPeHistory: boolean;
    anticoagulation: boolean;
    anticoagulationAgent: string;
  };
  // Section 2 — Risk Calculators
  risk: {
    asaClass: '' | 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
    heightCm: string;
    weightKg: string;
    procedureType: 'low' | 'intermediate' | 'high' | '';
    caprini: {
      age4160: boolean;
      age6174: boolean;
      age75plus: boolean;
      bmi25plus: boolean;
      dvtHistory: boolean;
      familyDvt: boolean;
      factor5Leiden: boolean;
      activeChemo: boolean;
      immobility72h: boolean;
      majorSurgery: boolean;
      arthroscopic: boolean;
      centralVenous: boolean;
      priorMajorSurgery: boolean;
      stroke: boolean;
      hfOrMi: boolean;
      sepsis: boolean;
      lungDisease: boolean;
      ibd: boolean;
      acuteMi: boolean;
      priorSurgery: boolean;
    };
  };
  // Section 3 — Clearance Tracking
  clearance: {
    labs: {
      cbc: LabPanel;
      bmp: LabPanel;
      coags: LabPanel;
      typeScreen: LabPanel;
      hba1c: LabPanel;
      lfts: LabPanel;
    };
    imaging: {
      cxr: ImagingItem;
      ekg: ImagingItem;
      echo: ImagingItem;
    };
    specialist: {
      cardiology: SpecialistClearance;
      pulmonology: SpecialistClearance;
      endocrinology: SpecialistClearance;
    };
  };
  // Section 5 — Pre-Op Checklist
  checklist: {
    npoConfirmed: boolean;
    consentSigned: boolean;
    siteMarked: boolean;
    allergiesVerified: boolean;
    dvtProphylaxisOrdered: boolean;
    antibioticsOrdered: boolean;
    labsReviewed: boolean;
    anesthesiaConsult: boolean;
  };
  notes: string;
}

// ── Helpers ──────────────────────────────────────────────────────
function calcBMI(heightCm: string, weightKg: string): number | null {
  const h = parseFloat(heightCm);
  const w = parseFloat(weightKg);
  if (!h || !w || h <= 0) return null;
  return Math.round((w / ((h / 100) ** 2)) * 10) / 10;
}

function calcCapriniScore(c: PreOpData['risk']['caprini']): number {
  let s = 0;
  if (c.age4160)         s += 1;
  if (c.age6174)         s += 2;
  if (c.age75plus)       s += 3;
  if (c.bmi25plus)       s += 1;
  if (c.dvtHistory)      s += 3;
  if (c.familyDvt)       s += 3;
  if (c.factor5Leiden)   s += 3;
  if (c.activeChemo)     s += 2;
  if (c.immobility72h)   s += 1;
  if (c.majorSurgery)    s += 2;
  if (c.arthroscopic)    s += 2;
  if (c.centralVenous)   s += 2;
  if (c.priorMajorSurgery) s += 1;
  if (c.stroke)          s += 5;
  if (c.hfOrMi)          s += 5;
  if (c.sepsis)          s += 5;
  if (c.lungDisease)     s += 1;
  if (c.ibd)             s += 1;
  if (c.acuteMi)         s += 1;
  if (c.priorSurgery)    s += 1;
  return s;
}

function capriniRisk(score: number): { label: string; color: string; rec: string } {
  if (score === 0)     return { label: 'Lowest',   color: '#10b981', rec: 'Early ambulation only' };
  if (score <= 2)      return { label: 'Low',      color: '#34d399', rec: 'SCDs intraoperatively' };
  if (score <= 4)      return { label: 'Moderate', color: '#f59e0b', rec: 'SCDs + consider LMWH' };
  if (score <= 8)      return { label: 'High',     color: '#f97316', rec: 'SCDs + LMWH × 7–10 days' };
  return               { label: 'Highest',  color: '#ef4444', rec: 'SCDs + LMWH × 30 days' };
}

function nsqipRisk(type: string): { label: string; color: string; morbidity: string; mortality: string } {
  if (type === 'low')          return { label: 'Low Risk',          color: '#10b981', morbidity: '<3%',   mortality: '<0.5%' };
  if (type === 'intermediate') return { label: 'Intermediate Risk', color: '#f59e0b', morbidity: '3–15%', mortality: '0.5–3%' };
  if (type === 'high')         return { label: 'High Risk',         color: '#ef4444', morbidity: '>15%',  mortality: '>3%' };
  return                              { label: 'Select procedure',  color: '#64748b', morbidity: '—',     mortality: '—' };
}

const ASA_DESCRIPTIONS: Record<string, string> = {
  I:   'Normal healthy patient',
  II:  'Mild systemic disease',
  III: 'Severe systemic disease',
  IV:  'Life-threatening systemic disease',
  V:   'Moribund — not expected to survive without surgery',
  VI:  'Brain-dead — organ donation',
};

const LAB_STATUS_COLORS: Record<LabStatus, string> = {
  pending:  '#64748b',
  ordered:  '#3b82f6',
  resulted: '#a78bfa',
  normal:   '#10b981',
  abnormal: '#ef4444',
};

const IMAGING_STATUS_COLORS: Record<ImagingStatus, string> = {
  pending:   '#64748b',
  ordered:   '#3b82f6',
  completed: '#a78bfa',
  reviewed:  '#10b981',
};

const CLEARANCE_STATUS_COLORS: Record<ClearanceStatus, string> = {
  pending:      '#64748b',
  requested:    '#3b82f6',
  cleared:      '#10b981',
  conditional:  '#f59e0b',
  not_required: '#475569',
};

// ── Default state ────────────────────────────────────────────────
function defaultPreOpData(): PreOpData {
  const labDefault: LabPanel = { ordered: false, status: 'pending', value: '' };
  const imagingDefault: ImagingItem = { ordered: false, status: 'pending', date: '', notes: '' };
  const clearanceDefault: SpecialistClearance = { needed: false, status: 'pending', notes: '', date: '' };
  return {
    history: { chiefComplaint: '', hpi: '', pmh: '', psh: '', medications: '', allergies: '', ros: '' },
    physical: {
      bpSystolic: '', bpDiastolic: '', hr: '', rr: '', temp: '', spo2: '',
      mallampati: '', cardio: '', pulmonary: '', abdomen: '', other: '',
    },
    comorbidities: {
      dm: false, dmType: '', htn: false, cad: false, ckd: false, ckdStage: '',
      copd: false, obesity: false, dvtPeHistory: false,
      anticoagulation: false, anticoagulationAgent: '',
    },
    risk: {
      asaClass: '', heightCm: '', weightKg: '', procedureType: '',
      caprini: {
        age4160: false, age6174: false, age75plus: false, bmi25plus: false,
        dvtHistory: false, familyDvt: false, factor5Leiden: false, activeChemo: false,
        immobility72h: false, majorSurgery: false, arthroscopic: false, centralVenous: false,
        priorMajorSurgery: false, stroke: false, hfOrMi: false, sepsis: false,
        lungDisease: false, ibd: false, acuteMi: false, priorSurgery: false,
      },
    },
    clearance: {
      labs: {
        cbc: { ...labDefault }, bmp: { ...labDefault }, coags: { ...labDefault },
        typeScreen: { ...labDefault }, hba1c: { ...labDefault }, lfts: { ...labDefault },
      },
      imaging: {
        cxr:  { ...imagingDefault }, ekg:  { ...imagingDefault }, echo: { ...imagingDefault },
      },
      specialist: {
        cardiology:    { ...clearanceDefault },
        pulmonology:   { ...clearanceDefault },
        endocrinology: { ...clearanceDefault },
      },
    },
    checklist: {
      npoConfirmed: false, consentSigned: false, siteMarked: false,
      allergiesVerified: false, dvtProphylaxisOrdered: false,
      antibioticsOrdered: false, labsReviewed: false, anesthesiaConsult: false,
    },
    notes: '',
  };
}

// ── DrawingPlaceholder ───────────────────────────────────────────
function DrawingPlaceholder() {
  return (
    <div style={{
      border: '2px dashed rgba(201,169,110,0.3)', borderRadius: 10,
      padding: '24px 20px', textAlign: 'center',
      background: 'rgba(201,169,110,0.03)',
    }}>
      <PenLine size={28} color="#c9a96e" style={{ opacity: 0.5, marginBottom: 8 }} />
      <div style={{ color: 'rgba(201,169,110,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        Surgical Drawing Tool
      </div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
        Mark the operative site on anatomical templates or patient photos.
      </div>
    </div>
  );
}

// ── AccordionPanel ───────────────────────────────────────────────
interface PanelProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

function AccordionPanel({ id, title, icon, badge, open, onToggle, children }: PanelProps) {
  return (
    <div style={{
      background: '#0a1628',
      border: '1px solid rgba(201,169,110,0.15)',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      <button
        onClick={() => onToggle(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#c9a96e' }}>{icon}</span>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{title}</span>
          {badge}
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: '4px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Shared style atoms ───────────────────────────────────────────
const S = {
  label:    { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block' as const, marginBottom: 5, marginTop: 12 },
  input:    { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#fff', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  textarea: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 10px', color: '#fff', fontSize: 13, outline: 'none', width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const, lineHeight: 1.5 },
  select:   { background: '#0d1f38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#fff', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  row2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
  row3:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } as React.CSSProperties,
  sectionTitle: { color: 'rgba(201,169,110,0.8)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginTop: 18, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid rgba(201,169,110,0.1)' },
  badge: (color: string) => ({
    display: 'inline-flex' as const, alignItems: 'center' as const,
    padding: '2px 8px', borderRadius: 10,
    background: `${color}22`, color, fontSize: 11, fontWeight: 700,
  }),
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' } as React.CSSProperties,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={S.label}>{label}</span>
      {children}
    </div>
  );
}

function CBadge({ color, label }: { color: string; label: string }) {
  return <span style={S.badge(color)}>{label}</span>;
}

// ── Checkbox helper ──────────────────────────────────────────────
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={S.checkRow} onClick={() => onChange(!checked)}>
      {checked
        ? <CheckSquare size={16} color="#c9a96e" style={{ flexShrink: 0 }} />
        : <Square size={16} color="rgba(255,255,255,0.25)" style={{ flexShrink: 0 }} />}
      <span style={{ color: checked ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 13 }}>{label}</span>
    </label>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function PreOpModule({ patientId, encounterId, orgId, onComplete }: Props) {
  const [data, setData] = useState<PreOpData>(defaultPreOpData());
  const [showDrawing, setShowDrawing] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    assessment: true, risk: false, clearance: false, siteMarking: false, checklist: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [loading, setLoading] = useState(true);

  // ── Load existing note ─────────────────────────────────────────
  useEffect(() => {
    async function loadNote() {
      setLoading(true);
      try {
        const { data: rows } = await (supabase as any)
          .schema('cr')
          .from('patient_notes')
          .select('note_id, note_text, created_at')
          .eq('encounter_id', encounterId)
          .eq('note_type', 'preop_module')
          .order('created_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          try {
            const parsed = JSON.parse(rows[0].note_text);
            // Deep-merge with defaults so new fields aren't undefined
            setData(prev => deepMerge(prev, parsed));
          } catch { /* ignore parse error, keep defaults */ }
        }
      } catch { /* table may not exist yet */ }
      setLoading(false);
    }
    loadNote();
  }, [encounterId]);

  // ── Deep merge utility ─────────────────────────────────────────
  function deepMerge<T extends object>(target: T, source: Partial<T>): T {
    const out = { ...target };
    for (const key in source) {
      const sv = source[key as keyof T];
      const tv = target[key as keyof T];
      if (sv !== null && typeof sv === 'object' && !Array.isArray(sv) && typeof tv === 'object') {
        (out as any)[key] = deepMerge(tv as any, sv as any);
      } else if (sv !== undefined) {
        (out as any)[key] = sv;
      }
    }
    return out;
  }

  // ── Setters ────────────────────────────────────────────────────
  const set = useCallback(<K extends keyof PreOpData>(section: K, value: Partial<PreOpData[K]>) => {
    setData(prev => ({ ...prev, [section]: { ...(prev[section] as object), ...value } }));
  }, []);

  const setNested = useCallback(<K extends keyof PreOpData, SK extends keyof PreOpData[K]>(
    section: K, sub: SK, value: Partial<PreOpData[K][SK]>
  ) => {
    setData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as object),
        [sub]: { ...(prev[section][sub] as object), ...value },
      },
    }));
  }, []);

  const togglePanel = useCallback((id: string) => {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ── Save ───────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    setSaveErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).schema('cr').from('patient_notes').insert({
        org_id:      orgId,
        patient_id:  patientId,
        encounter_id: encounterId,
        note_type:   'preop_module',
        note_text:   JSON.stringify(data),
        created_by:  user?.id ?? null,
      });
      setSaveMsg('Pre-op documentation saved');
      setTimeout(() => setSaveMsg(''), 3000);
      onComplete?.();
    } catch (e: any) {
      setSaveErr(e.message ?? 'Save failed');
    }
    setSaving(false);
  };

  // ── Derived calculations ───────────────────────────────────────
  const bmi = calcBMI(data.risk.heightCm, data.risk.weightKg);
  const capriniScore = calcCapriniScore(data.risk.caprini);
  const capriniInfo  = capriniRisk(capriniScore);
  const nsqip        = nsqipRisk(data.risk.procedureType);

  // Checklist completion
  const checklistItems = Object.values(data.checklist);
  const checklistDone  = checklistItems.filter(Boolean).length;
  const checklistTotal = checklistItems.length;

  // Clearance completion badge
  const clearancePending = [
    ...Object.values(data.clearance.labs).filter(l => l.ordered && l.status === 'ordered'),
    ...Object.values(data.clearance.imaging).filter(i => i.ordered && i.status === 'ordered'),
    ...Object.values(data.clearance.specialist).filter(s => s.needed && s.status === 'requested'),
  ].length;

  if (loading) {
    return (
      <div style={{ background: '#060e1c', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
        <Loader2 size={24} color="#c9a96e" style={{ animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font-rajdhani, system-ui, sans-serif)', color: '#fff', maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
            Pre-Operative Documentation
          </h2>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>
            Encounter {encounterId} · Patient {patientId}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveMsg && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981', fontSize: 12 }}>
              <CheckCircle2 size={14} /> {saveMsg}
            </span>
          )}
          {saveErr && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontSize: 12 }}>
              <AlertCircle size={14} /> {saveErr}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: saving ? 'rgba(201,169,110,0.4)' : '#c9a96e',
              color: '#060e1c', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving
              ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
              : <><Save size={14} /> Save Pre-Op</>}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — STRUCTURED ASSESSMENT
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="assessment"
        title="Structured Assessment"
        icon={<Stethoscope size={16} />}
        open={open.assessment}
        onToggle={togglePanel}
      >
        {/* History */}
        <div style={S.sectionTitle}>History</div>

        <Field label="Chief Complaint">
          <input
            value={data.history.chiefComplaint}
            onChange={e => set('history', { chiefComplaint: e.target.value })}
            placeholder="Primary reason for surgery"
            style={S.input}
          />
        </Field>

        <Field label="History of Present Illness (HPI)">
          <textarea
            value={data.history.hpi}
            onChange={e => set('history', { hpi: e.target.value })}
            placeholder="Onset, duration, character, location, severity, modifying factors…"
            rows={3}
            style={S.textarea}
          />
        </Field>

        <div style={S.row2}>
          <Field label="Past Medical History (PMH)">
            <textarea
              value={data.history.pmh}
              onChange={e => set('history', { pmh: e.target.value })}
              placeholder="Chronic conditions, hospitalizations…"
              rows={3}
              style={S.textarea}
            />
          </Field>
          <Field label="Past Surgical History (PSH)">
            <textarea
              value={data.history.psh}
              onChange={e => set('history', { psh: e.target.value })}
              placeholder="Prior procedures, dates, complications…"
              rows={3}
              style={S.textarea}
            />
          </Field>
        </div>

        <div style={S.row2}>
          <Field label="Current Medications">
            <textarea
              value={data.history.medications}
              onChange={e => set('history', { medications: e.target.value })}
              placeholder="Name, dose, frequency…"
              rows={3}
              style={S.textarea}
            />
          </Field>
          <Field label="Allergies">
            <textarea
              value={data.history.allergies}
              onChange={e => set('history', { allergies: e.target.value })}
              placeholder="Drug, food, latex allergies + reactions…"
              rows={3}
              style={S.textarea}
            />
          </Field>
        </div>

        <Field label="Review of Systems (ROS)">
          <textarea
            value={data.history.ros}
            onChange={e => set('history', { ros: e.target.value })}
            placeholder="Constitutional, CV, pulmonary, GI, GU, neuro, musculoskeletal, endocrine, heme/lymph…"
            rows={3}
            style={S.textarea}
          />
        </Field>

        {/* Physical Exam */}
        <div style={S.sectionTitle}>Physical Examination</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {([
            ['BP Systolic', 'bpSystolic', 'mmHg'],
            ['BP Diastolic', 'bpDiastolic', 'mmHg'],
            ['HR', 'hr', 'bpm'],
            ['RR', 'rr', 'br/min'],
            ['Temp', 'temp', '°F'],
            ['SpO₂', 'spo2', '%'],
          ] as [string, keyof PreOpData['physical'], string][]).map(([lbl, key, unit]) => (
            <div key={key}>
              <span style={S.label}>{lbl}</span>
              <div style={{ position: 'relative' }}>
                <input
                  value={data.physical[key] as string}
                  onChange={e => set('physical', { [key]: e.target.value } as any)}
                  placeholder="—"
                  style={{ ...S.input, paddingRight: unit.length > 3 ? 48 : 36 }}
                />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 10, pointerEvents: 'none' }}>
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={S.row2}>
          <Field label="Airway — Mallampati Class">
            <select
              value={data.physical.mallampati}
              onChange={e => set('physical', { mallampati: e.target.value as any })}
              style={S.select}
            >
              <option value="">Select class…</option>
              {['I', 'II', 'III', 'IV'].map(c => (
                <option key={c} value={c}>Class {c} — {
                  c === 'I'   ? 'Full visibility of tonsils/uvula' :
                  c === 'II'  ? 'Upper portion of tonsils visible' :
                  c === 'III' ? 'Soft palate only' :
                  'Hard palate only — difficult airway'
                }</option>
              ))}
            </select>
          </Field>
          <div /> {/* spacer */}
        </div>

        <div style={S.row3}>
          <Field label="Cardiovascular Exam">
            <textarea
              value={data.physical.cardio}
              onChange={e => set('physical', { cardio: e.target.value })}
              placeholder="RRR, no murmurs…"
              rows={2}
              style={S.textarea}
            />
          </Field>
          <Field label="Pulmonary Exam">
            <textarea
              value={data.physical.pulmonary}
              onChange={e => set('physical', { pulmonary: e.target.value })}
              placeholder="CTA bilateral, no wheezes…"
              rows={2}
              style={S.textarea}
            />
          </Field>
          <Field label="Abdominal Exam">
            <textarea
              value={data.physical.abdomen}
              onChange={e => set('physical', { abdomen: e.target.value })}
              placeholder="Soft, non-tender, no masses…"
              rows={2}
              style={S.textarea}
            />
          </Field>
        </div>

        <Field label="Other Exam Findings">
          <textarea
            value={data.physical.other}
            onChange={e => set('physical', { other: e.target.value })}
            placeholder="Skin, extremities, neuro, musculoskeletal…"
            rows={2}
            style={S.textarea}
          />
        </Field>

        {/* Comorbidities */}
        <div style={S.sectionTitle}>Comorbidities</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          <div>
            <Checkbox
              checked={data.comorbidities.dm}
              onChange={v => set('comorbidities', { dm: v })}
              label="Diabetes Mellitus"
            />
            {data.comorbidities.dm && (
              <div style={{ marginLeft: 24, marginBottom: 4 }}>
                <select
                  value={data.comorbidities.dmType}
                  onChange={e => set('comorbidities', { dmType: e.target.value as any })}
                  style={{ ...S.select, width: 160, fontSize: 12, padding: '4px 8px' }}
                >
                  <option value="">Type…</option>
                  <option value="type1">Type 1</option>
                  <option value="type2">Type 2</option>
                </select>
              </div>
            )}
            <Checkbox checked={data.comorbidities.htn} onChange={v => set('comorbidities', { htn: v })} label="Hypertension (HTN)" />
            <Checkbox checked={data.comorbidities.cad} onChange={v => set('comorbidities', { cad: v })} label="Coronary Artery Disease (CAD)" />
            <Checkbox checked={data.comorbidities.ckd} onChange={v => set('comorbidities', { ckd: v })} label="Chronic Kidney Disease (CKD)" />
            {data.comorbidities.ckd && (
              <div style={{ marginLeft: 24, marginBottom: 4 }}>
                <input
                  value={data.comorbidities.ckdStage}
                  onChange={e => set('comorbidities', { ckdStage: e.target.value })}
                  placeholder="Stage (1–5)"
                  style={{ ...S.input, width: 120, fontSize: 12, padding: '4px 8px' }}
                />
              </div>
            )}
          </div>
          <div>
            <Checkbox checked={data.comorbidities.copd} onChange={v => set('comorbidities', { copd: v })} label="COPD / Pulmonary Disease" />
            <Checkbox checked={data.comorbidities.obesity} onChange={v => set('comorbidities', { obesity: v })} label="Obesity (BMI ≥30)" />
            <Checkbox checked={data.comorbidities.dvtPeHistory} onChange={v => set('comorbidities', { dvtPeHistory: v })} label="Prior DVT / PE History" />
            <Checkbox checked={data.comorbidities.anticoagulation} onChange={v => set('comorbidities', { anticoagulation: v })} label="Active Anticoagulation" />
            {data.comorbidities.anticoagulation && (
              <div style={{ marginLeft: 24, marginBottom: 4 }}>
                <input
                  value={data.comorbidities.anticoagulationAgent}
                  onChange={e => set('comorbidities', { anticoagulationAgent: e.target.value })}
                  placeholder="Agent (warfarin, apixaban…)"
                  style={{ ...S.input, width: 200, fontSize: 12, padding: '4px 8px' }}
                />
              </div>
            )}
          </div>
        </div>
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — RISK CALCULATORS
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="risk"
        title="Risk Calculators"
        icon={<Calculator size={16} />}
        badge={
          data.risk.asaClass
            ? <CBadge color="#c9a96e" label={`ASA ${data.risk.asaClass}`} />
            : undefined
        }
        open={open.risk}
        onToggle={togglePanel}
      >

        {/* ASA Physical Status */}
        <div style={S.sectionTitle}>ASA Physical Status</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {(['I', 'II', 'III', 'IV', 'V', 'VI'] as const).map(cls => {
            const active = data.risk.asaClass === cls;
            return (
              <button
                key={cls}
                onClick={() => set('risk', { asaClass: cls })}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${active ? '#c9a96e' : 'rgba(255,255,255,0.12)'}`,
                  background: active ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#c9a96e' : 'rgba(255,255,255,0.5)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {cls}
              </button>
            );
          })}
        </div>
        {data.risk.asaClass && (
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>
            {ASA_DESCRIPTIONS[data.risk.asaClass]}
          </div>
        )}

        {/* BMI Calculator */}
        <div style={S.sectionTitle}>BMI Calculator</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 140 }}>
            <span style={S.label}>Height (cm)</span>
            <input
              value={data.risk.heightCm}
              onChange={e => set('risk', { heightCm: e.target.value })}
              placeholder="e.g. 170"
              type="number"
              style={S.input}
            />
          </div>
          <div style={{ width: 140 }}>
            <span style={S.label}>Weight (kg)</span>
            <input
              value={data.risk.weightKg}
              onChange={e => set('risk', { weightKg: e.target.value })}
              placeholder="e.g. 80"
              type="number"
              style={S.input}
            />
          </div>
          <div style={{
            padding: '10px 20px', borderRadius: 10,
            background: bmi
              ? bmi < 18.5 ? 'rgba(59,130,246,0.15)'
              : bmi < 25   ? 'rgba(16,185,129,0.15)'
              : bmi < 30   ? 'rgba(245,158,11,0.15)'
              : bmi < 35   ? 'rgba(249,115,22,0.15)'
              : 'rgba(239,68,68,0.15)'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${bmi
              ? bmi < 18.5 ? 'rgba(59,130,246,0.3)'
              : bmi < 25   ? 'rgba(16,185,129,0.3)'
              : bmi < 30   ? 'rgba(245,158,11,0.3)'
              : bmi < 35   ? 'rgba(249,115,22,0.3)'
              : 'rgba(239,68,68,0.3)'
              : 'rgba(255,255,255,0.1)'}`,
            minWidth: 120,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>BMI</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: bmi
              ? bmi < 18.5 ? '#3b82f6'
              : bmi < 25   ? '#10b981'
              : bmi < 30   ? '#f59e0b'
              : bmi < 35   ? '#f97316'
              : '#ef4444'
              : 'rgba(255,255,255,0.2)' }}>
              {bmi ?? '—'}
            </div>
            {bmi && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : bmi < 35 ? 'Obese I' : bmi < 40 ? 'Obese II' : 'Obese III'}
              </div>
            )}
          </div>
        </div>

        {/* NSQIP Risk Display */}
        <div style={S.sectionTitle}>NSQIP Procedure Risk Tier</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {(['low', 'intermediate', 'high'] as const).map(t => {
            const active = data.risk.procedureType === t;
            const info = nsqipRisk(t);
            return (
              <button
                key={t}
                onClick={() => set('risk', { procedureType: t })}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 9,
                  border: `1px solid ${active ? info.color : 'rgba(255,255,255,0.1)'}`,
                  background: active ? `${info.color}18` : 'rgba(255,255,255,0.03)',
                  color: active ? info.color : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', textAlign: 'center' as const,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{t}</div>
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.75 }}>{info.morbidity} morbidity</div>
              </button>
            );
          })}
        </div>
        {data.risk.procedureType && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: `${nsqip.color}12`, border: `1px solid ${nsqip.color}30` }}>
            <span style={{ color: nsqip.color, fontSize: 12, fontWeight: 700 }}>{nsqip.label}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 10 }}>
              Morbidity {nsqip.morbidity} · Mortality {nsqip.mortality}
            </span>
          </div>
        )}

        {/* Caprini VTE Score */}
        <div style={S.sectionTitle}>
          <span>Caprini VTE Risk Score</span>
          <span style={{ marginLeft: 10, ...S.badge(capriniInfo.color) }}>
            Score: {capriniScore} — {capriniInfo.label}
          </span>
        </div>
        <div style={{ color: 'rgba(201,169,110,0.7)', fontSize: 11, marginBottom: 10, fontStyle: 'italic' }}>
          Recommendation: {capriniInfo.rec}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
          {([
            ['age4160',         '1pt — Age 41–60',                  1],
            ['age6174',         '2pt — Age 61–74',                  2],
            ['age75plus',       '3pt — Age ≥75',                    3],
            ['bmi25plus',       '1pt — BMI >25',                    1],
            ['dvtHistory',      '3pt — Prior DVT/PE',               3],
            ['familyDvt',       '3pt — Family DVT history',         3],
            ['factor5Leiden',   '3pt — Factor V Leiden / thrombophilia', 3],
            ['activeChemo',     '2pt — Active chemotherapy',        2],
            ['immobility72h',   '1pt — Bedrest / immobility >72h',  1],
            ['majorSurgery',    '2pt — Major open surgery planned', 2],
            ['arthroscopic',    '2pt — Arthroscopic / lap surgery', 2],
            ['centralVenous',   '2pt — Central venous catheter',    2],
            ['priorMajorSurgery','1pt — Prior major surgery (<1mo)', 1],
            ['stroke',          '5pt — Stroke (<1mo)',              5],
            ['hfOrMi',          '5pt — HF or MI (<1mo)',            5],
            ['sepsis',          '5pt — Sepsis (<1mo)',              5],
            ['lungDisease',     '1pt — Serious lung disease',       1],
            ['ibd',             '1pt — Inflammatory bowel disease', 1],
            ['acuteMi',         '1pt — Acute MI',                   1],
            ['priorSurgery',    '1pt — Prior minor surgery',        1],
          ] as [keyof PreOpData['risk']['caprini'], string, number][]).map(([key, label]) => (
            <Checkbox
              key={key}
              checked={data.risk.caprini[key]}
              onChange={v => setNested('risk', 'caprini', { [key]: v } as any)}
              label={label}
            />
          ))}
        </div>

        {/* AI augmentation over the calculated scores */}
        <AIRiskAssessment
          clinicalParams={{
            asaClass: data.risk.asaClass,
            heightCm: data.risk.heightCm,
            weightKg: data.risk.weightKg,
            procedureRiskCategory: data.risk.procedureType,
          }}
          calculatedScores={{ capriniFactors: data.risk.caprini }}
          specialty="general_surgery"
        />
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — CLEARANCE TRACKING
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="clearance"
        title="Clearance Tracking"
        icon={<ShieldCheck size={16} />}
        badge={
          clearancePending > 0
            ? <CBadge color="#f59e0b" label={`${clearancePending} pending`} />
            : undefined
        }
        open={open.clearance}
        onToggle={togglePanel}
      >

        {/* Labs */}
        <div style={S.sectionTitle}>Laboratory Panels</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Panel</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700 }}>Ordered</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Result / Notes</th>
              </tr>
            </thead>
            <tbody>
              {([
                ['cbc',        'CBC (Complete Blood Count)'],
                ['bmp',        'BMP (Basic Metabolic Panel)'],
                ['coags',      'Coagulation (PT/INR, aPTT)'],
                ['typeScreen', 'Type & Screen'],
                ['hba1c',      'HbA1c'],
                ['lfts',       'LFTs (Liver Function)'],
              ] as [keyof PreOpData['clearance']['labs'], string][]).map(([key, name]) => {
                const lab = data.clearance.labs[key];
                return (
                  <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 8px', color: '#fff', fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={lab.ordered}
                        onChange={e => setNested('clearance', 'labs', { [key]: { ...lab, ordered: e.target.checked } } as any)}
                        style={{ accentColor: '#c9a96e', width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '8px 8px' }}>
                      <select
                        value={lab.status}
                        onChange={e => setNested('clearance', 'labs', { [key]: { ...lab, status: e.target.value as LabStatus } } as any)}
                        style={{ ...S.select, padding: '4px 8px', fontSize: 11, width: 130 }}
                        disabled={!lab.ordered}
                      >
                        <option value="pending">Pending</option>
                        <option value="ordered">Ordered</option>
                        <option value="resulted">Resulted</option>
                        <option value="normal">Normal</option>
                        <option value="abnormal">Abnormal</option>
                      </select>
                      {lab.ordered && (
                        <span style={{ ...S.badge(LAB_STATUS_COLORS[lab.status]), marginLeft: 6, fontSize: 10 }}>
                          {lab.status}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 8px' }}>
                      <input
                        value={lab.value}
                        onChange={e => setNested('clearance', 'labs', { [key]: { ...lab, value: e.target.value } } as any)}
                        placeholder="Result value…"
                        disabled={!lab.ordered}
                        style={{ ...S.input, fontSize: 11, padding: '4px 8px', opacity: lab.ordered ? 1 : 0.4 }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Imaging */}
        <div style={S.sectionTitle}>Imaging & Diagnostics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {([
            ['cxr',  'Chest X-Ray (CXR)'],
            ['ekg',  'EKG / ECG'],
            ['echo', 'Echocardiogram'],
          ] as [keyof PreOpData['clearance']['imaging'], string][]).map(([key, name]) => {
            const img = data.clearance.imaging[key];
            return (
              <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{name}</span>
                  <input
                    type="checkbox"
                    checked={img.ordered}
                    onChange={e => setNested('clearance', 'imaging', { [key]: { ...img, ordered: e.target.checked } } as any)}
                    style={{ accentColor: '#c9a96e', width: 14, height: 14, cursor: 'pointer' }}
                  />
                </div>
                <select
                  value={img.status}
                  onChange={e => setNested('clearance', 'imaging', { [key]: { ...img, status: e.target.value as ImagingStatus } } as any)}
                  disabled={!img.ordered}
                  style={{ ...S.select, fontSize: 11, padding: '4px 8px', marginBottom: 6, opacity: img.ordered ? 1 : 0.4 }}
                >
                  <option value="pending">Pending</option>
                  <option value="ordered">Ordered</option>
                  <option value="completed">Completed</option>
                  <option value="reviewed">Reviewed</option>
                </select>
                {img.ordered && (
                  <span style={{ ...S.badge(IMAGING_STATUS_COLORS[img.status]), fontSize: 10, marginBottom: 6, display: 'inline-flex' }}>
                    {img.status}
                  </span>
                )}
                <input
                  type="date"
                  value={img.date}
                  onChange={e => setNested('clearance', 'imaging', { [key]: { ...img, date: e.target.value } } as any)}
                  disabled={!img.ordered}
                  style={{ ...S.input, fontSize: 11, padding: '4px 8px', marginTop: 4, opacity: img.ordered ? 1 : 0.4 }}
                />
                <textarea
                  value={img.notes}
                  onChange={e => setNested('clearance', 'imaging', { [key]: { ...img, notes: e.target.value } } as any)}
                  placeholder="Findings / notes…"
                  disabled={!img.ordered}
                  rows={2}
                  style={{ ...S.textarea, fontSize: 11, padding: '4px 8px', marginTop: 4, opacity: img.ordered ? 1 : 0.4 }}
                />
              </div>
            );
          })}
        </div>

        {/* Specialist Clearance */}
        <div style={S.sectionTitle}>Specialist Clearance</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {([
            ['cardiology',    'Cardiology'],
            ['pulmonology',   'Pulmonology'],
            ['endocrinology', 'Endocrinology'],
          ] as [keyof PreOpData['clearance']['specialist'], string][]).map(([key, name]) => {
            const spec = data.clearance.specialist[key];
            return (
              <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{name}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={spec.needed}
                      onChange={e => setNested('clearance', 'specialist', { [key]: { ...spec, needed: e.target.checked } } as any)}
                      style={{ accentColor: '#c9a96e', width: 14, height: 14 }}
                    />
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Required</span>
                  </label>
                </div>
                <select
                  value={spec.status}
                  onChange={e => setNested('clearance', 'specialist', { [key]: { ...spec, status: e.target.value as ClearanceStatus } } as any)}
                  disabled={!spec.needed}
                  style={{ ...S.select, fontSize: 11, padding: '4px 8px', marginBottom: 6, opacity: spec.needed ? 1 : 0.4 }}
                >
                  <option value="pending">Pending</option>
                  <option value="requested">Requested</option>
                  <option value="cleared">Cleared</option>
                  <option value="conditional">Conditional</option>
                  <option value="not_required">Not Required</option>
                </select>
                {spec.needed && (
                  <span style={{ ...S.badge(CLEARANCE_STATUS_COLORS[spec.status]), fontSize: 10, marginBottom: 6, display: 'inline-flex' }}>
                    {spec.status.replace('_', ' ')}
                  </span>
                )}
                <input
                  type="date"
                  value={spec.date}
                  onChange={e => setNested('clearance', 'specialist', { [key]: { ...spec, date: e.target.value } } as any)}
                  disabled={!spec.needed}
                  style={{ ...S.input, fontSize: 11, padding: '4px 8px', marginTop: 4, opacity: spec.needed ? 1 : 0.4 }}
                />
                <textarea
                  value={spec.notes}
                  onChange={e => setNested('clearance', 'specialist', { [key]: { ...spec, notes: e.target.value } } as any)}
                  placeholder="Clearance notes / conditions…"
                  disabled={!spec.needed}
                  rows={2}
                  style={{ ...S.textarea, fontSize: 11, padding: '4px 8px', marginTop: 4, opacity: spec.needed ? 1 : 0.4 }}
                />
              </div>
            );
          })}
        </div>
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — SURGICAL SITE MARKING
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="siteMarking"
        title="Surgical Site Marking"
        icon={<PenLine size={16} />}
        open={open.siteMarking}
        onToggle={togglePanel}
      >
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8, marginBottom: 14 }}>
          Surgical site marking must be completed per Joint Commission Universal Protocol requirements. Mark the operative site with patient awake and involved.
        </div>

        {showDrawing ? (
          <React.Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'rgba(201,169,110,0.6)', fontSize: 13 }}>
              Loading drawing tool…
            </div>
          }>
            <SurgicalDrawingTool patientId={String(patientId)} encounterId={String(encounterId)} orgId={orgId} />
          </React.Suspense>
        ) : (
          <DrawingPlaceholder />
        )}

        <div style={{ marginTop: 14 }}>
          <button
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid rgba(201,169,110,0.3)',
              background: 'rgba(201,169,110,0.08)',
              color: '#c9a96e', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setShowDrawing(s => !s)}
          >
            <PenLine size={14} /> {showDrawing ? 'Hide Drawing Tool' : 'Open Drawing Tool'}
          </button>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginLeft: 12 }}>
            Annotate anatomical templates or patient photos — Apple Pencil supported.
          </span>
        </div>

        <Field label="Site Marking Notes">
          <textarea
            value={''}
            onChange={() => {}}
            placeholder="Describe site marking location, laterality, additional notes for anesthesia team…"
            rows={3}
            style={S.textarea}
          />
        </Field>
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — PRE-OP CHECKLIST
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="checklist"
        title="Pre-Op Checklist"
        icon={<ClipboardList size={16} />}
        badge={
          <CBadge
            color={checklistDone === checklistTotal ? '#10b981' : checklistDone > 0 ? '#f59e0b' : '#64748b'}
            label={`${checklistDone}/${checklistTotal}`}
          />
        }
        open={open.checklist}
        onToggle={togglePanel}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 8 }}>
          <Checkbox
            checked={data.checklist.npoConfirmed}
            onChange={v => set('checklist', { npoConfirmed: v })}
            label="NPO status confirmed (nothing by mouth)"
          />
          <Checkbox
            checked={data.checklist.consentSigned}
            onChange={v => set('checklist', { consentSigned: v })}
            label="Informed consent signed"
          />
          <Checkbox
            checked={data.checklist.siteMarked}
            onChange={v => set('checklist', { siteMarked: v })}
            label="Surgical site marked & verified with patient"
          />
          <Checkbox
            checked={data.checklist.allergiesVerified}
            onChange={v => set('checklist', { allergiesVerified: v })}
            label="Allergies verified and documented"
          />
          <Checkbox
            checked={data.checklist.dvtProphylaxisOrdered}
            onChange={v => set('checklist', { dvtProphylaxisOrdered: v })}
            label="DVT prophylaxis ordered (SCDs / LMWH)"
          />
          <Checkbox
            checked={data.checklist.antibioticsOrdered}
            onChange={v => set('checklist', { antibioticsOrdered: v })}
            label="Pre-op antibiotics ordered"
          />
          <Checkbox
            checked={data.checklist.labsReviewed}
            onChange={v => set('checklist', { labsReviewed: v })}
            label="Labs reviewed and clearance obtained"
          />
          <Checkbox
            checked={data.checklist.anesthesiaConsult}
            onChange={v => set('checklist', { anesthesiaConsult: v })}
            label="Anesthesia consult / notification completed"
          />
        </div>

        {checklistDone === checklistTotal && checklistTotal > 0 && (
          <div style={{
            marginTop: 16, padding: '10px 16px', borderRadius: 8,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle2 size={16} color="#10b981" />
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>
              All pre-op checklist items complete — patient cleared to proceed.
            </span>
          </div>
        )}

        {checklistDone < checklistTotal && checklistDone > 0 && (
          <div style={{
            marginTop: 16, padding: '10px 16px', borderRadius: 8,
            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={16} color="#f59e0b" />
            <span style={{ color: '#f59e0b', fontSize: 13 }}>
              {checklistTotal - checklistDone} item{checklistTotal - checklistDone !== 1 ? 's' : ''} remaining before OR clearance.
            </span>
          </div>
        )}
      </AccordionPanel>

      {/* ── Additional Notes ──────────────────────────────────── */}
      <div style={{ background: '#0a1628', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Activity size={15} color="#c9a96e" />
          <span style={{ color: '#c9a96e', fontSize: 13, fontWeight: 700 }}>Additional Clinical Notes</span>
        </div>
        <textarea
          value={data.notes}
          onChange={e => setData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Any additional pre-operative notes, anesthesia concerns, surgeon notes, or care plan items…"
          rows={4}
          style={S.textarea}
        />
      </div>

      {/* ── Footer save ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 4, paddingBottom: 24 }}>
        {saveErr && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontSize: 12, alignSelf: 'center' }}>
            <AlertCircle size={14} /> {saveErr}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 24px', borderRadius: 9, border: 'none',
            background: saving ? 'rgba(201,169,110,0.4)' : '#c9a96e',
            color: '#060e1c', fontSize: 14, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: saving ? 'none' : '0 4px 16px rgba(201,169,110,0.25)',
          }}
        >
          {saving
            ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
            : <><Save size={15} /> Save Pre-Op Documentation</>}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
