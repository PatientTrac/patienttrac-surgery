// ================================================================
// PatientTrac Surgery — Post-Operative Monitoring & Follow-Up Module
// Dark navy/gold theme matching Revela design system
// ================================================================

import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ChevronDown, ChevronRight, Save, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, Activity, ClipboardList,
  Stethoscope, CheckSquare, Square, Plus, Trash2,
  Calendar, FlaskConical, ShieldAlert, Bell,
} from 'lucide-react';
import MARPanel from './MARPanel';

// ── Props ────────────────────────────────────────────────────────
interface Props {
  patientId: string | number;
  encounterId: string | number;
  orgId: string;
  procedure?: string;
}

// ── Sub-types ────────────────────────────────────────────────────
type WoundType         = 'primary' | 'secondary' | '';
type WoundClosure     = 'staples' | 'sutures' | 'steri-strips' | 'vacuum' | '';
type WoundCondition   = 'intact' | 'seroma' | 'hematoma' | 'infection' | 'dehiscence' | '';
type PathologyStatus  = 'awaiting' | 'received' | 'normal' | 'abnormal' | '';
type DvtStatus        = '' | 'suspected' | 'confirmed';
type ClavienDindo     = '' | 'I' | 'II' | 'IIIa' | 'IIIb' | 'IVa' | 'IVb' | 'V';

interface VitalEntry {
  id: string;
  timestamp: string;
  bp: string;
  hr: string;
  rr: string;
  spo2: string;
  temp: string;
  pain: string;
}

interface DrainEntry {
  id: string;
  type: string;
  location: string;
  removalDate: string;
  outputs: { date: string; amount: string; character: string }[];
}

interface DressingEntry {
  id: string;
  date: string;
  performedBy: string;
  notes: string;
}

interface FollowUpEntry {
  id: string;
  date: string;
  purpose: string;
  completed: boolean;
  notes: string;
}

interface Complication {
  ssiSuperficial:    boolean;
  ssiDeep:           boolean;
  ssiOrganSpace:     boolean;
  anastomoticLeak:   boolean;
  dvtStatus:         DvtStatus;
  peStatus:          DvtStatus;
  readmission:       boolean;
  readmissionDate:   string;
  readmissionReason: string;
  otherComplication: string;
  clavienDindo:      ClavienDindo;
}

interface AldreteScores {
  activity:      0 | 1 | 2;
  respiration:   0 | 1 | 2;
  circulation:   0 | 1 | 2;
  consciousness: 0 | 1 | 2;
  o2Sat:         0 | 1 | 2;
}

interface PostOpData {
  // Section 1 — PACU
  pacu: {
    aldrete:         AldreteScores;
    vitals:          VitalEntry[];
    dischargeCriteria: {
      aldreteGe8:      boolean;
      painControlled:  boolean;
      nvResolved:      boolean;
      voided:          boolean;
      ambulating:      boolean;
    };
    pacuNotes: string;
  };
  // Section 2 — Wound & Drain
  wound: {
    type:        WoundType;
    closure:     WoundClosure;
    condition:   WoundCondition;
    woundNotes:  string;
    drains:      DrainEntry[];
    dressings:   DressingEntry[];
  };
  // Section 3 — Complications
  complications: Complication;
  // Section 4 — Discharge Checklist
  discharge: {
    painOralMeds:         boolean;
    toleratingDiet:       boolean;
    ambulating:           boolean;
    woundInstructions:    boolean;
    followUpScheduled:    boolean;
    prescriptionsGiven:   boolean;
    activityRestrictions: boolean;
    returnPrecautions:    boolean;
    dischargeNotes:       string;
  };
  // Section 5 — Follow-up
  followUp: {
    entries:          FollowUpEntry[];
    pathologyStatus:  PathologyStatus;
    pathologyNotes:   string;
    surveillanceNotes: string;
  };
}

// ── Procedure-specific follow-up intervals ───────────────────────
interface FollowUpTemplate {
  label: string;
  intervals: string[];
  surveillance?: string[];
}

const PROCEDURE_TEMPLATES: Record<string, FollowUpTemplate> = {
  'hernia repair': {
    label: 'Hernia Repair',
    intervals: ['2 weeks — wound check, pain assessment', '6 weeks — return to activity assessment'],
    surveillance: ['Annual physical exam for recurrence'],
  },
  'appendectomy': {
    label: 'Appendectomy',
    intervals: ['2 weeks — wound check', '6 weeks — activity clearance'],
  },
  'cholecystectomy': {
    label: 'Cholecystectomy',
    intervals: ['1–2 weeks — wound check', '6 weeks — full activity release'],
  },
  'colon resection': {
    label: 'Colon Resection',
    intervals: [
      '2 weeks — wound check, ostomy management if applicable',
      'Path results appointment (when available)',
      '3 months — surveillance CT if oncologic',
    ],
    surveillance: ['Colonoscopy at 1 year (oncologic)', '3-month CT chest/abdomen/pelvis (oncologic)', 'Annual CEA if CRC'],
  },
  'colectomy': {
    label: 'Colectomy',
    intervals: [
      '2 weeks — wound check',
      'Path results appointment',
      '3 months — oncologic surveillance',
    ],
    surveillance: ['Colonoscopy at 1 year', '3-month CT scan (oncologic)', 'Annual CEA if CRC'],
  },
  'whipple': {
    label: 'Whipple / Pancreaticoduodenectomy',
    intervals: [
      '2 weeks — wound check, drain management',
      '4–6 weeks — lab work (LFTs, amylase)',
      '3 months — CT scan + CA 19-9',
    ],
    surveillance: ['3-month CT + CA 19-9 × 2 years', 'Annual CT thereafter', 'Endocrine function monitoring'],
  },
  'gastrectomy': {
    label: 'Gastrectomy',
    intervals: [
      '2 weeks — wound check, nutritional assessment',
      'Path results appointment',
      '3 months — CT chest/abdomen/pelvis',
    ],
    surveillance: ['3-month CT × 2 years', 'Nutritional labs every 6 months', 'B12 monitoring (total gastrectomy)'],
  },
  'thyroidectomy': {
    label: 'Thyroidectomy',
    intervals: [
      '1 week — wound check, calcium monitoring',
      '6 weeks — TSH / thyroid hormone adjustment',
      'Path results appointment',
    ],
    surveillance: ['TSH every 6 months (first year)', 'Thyroglobulin if total thyroidectomy for cancer', 'Annual neck ultrasound (thyroid CA)'],
  },
  'splenectomy': {
    label: 'Splenectomy',
    intervals: ['2 weeks — wound check', '6 weeks — vaccine verification (pneumococcal, meningococcal, HiB)'],
    surveillance: ['Annual influenza vaccine', 'Periodic CBC monitoring'],
  },
};

// ── Caprini helpers (reused for Clavien display) ─────────────────
const CLAVIEN_DESCRIPTIONS: Record<string, string> = {
  I:   'Any deviation from normal postop course without pharmacological treatment or surgical/endoscopic/radiological intervention',
  II:  'Requiring pharmacological treatment with drugs other than allowed for grade I (blood transfusions, TPN)',
  IIIa:'Requiring surgical/endoscopic/radiological intervention — not under general anesthesia',
  IIIb:'Requiring surgical/endoscopic/radiological intervention — under general anesthesia',
  IVa: 'Life-threatening complication requiring IC/ICU management — single-organ dysfunction',
  IVb: 'Life-threatening complication requiring IC/ICU management — multi-organ dysfunction',
  V:   'Death of patient',
};

const ALDRETE_LABELS: Record<keyof AldreteScores, { criterion: string; scores: string[] }> = {
  activity:      { criterion: 'Activity',      scores: ['0 — Unable to move extremities', '1 — Moves 2 extremities voluntarily', '2 — Moves all 4 extremities'] },
  respiration:   { criterion: 'Respiration',   scores: ['0 — Apneic', '1 — Dyspnea / shallow breathing', '2 — Deep breath / cough freely'] },
  circulation:   { criterion: 'Circulation',   scores: ['0 — BP ±50 mmHg of pre-op', '1 — BP ±20–50 mmHg of pre-op', '2 — BP ±20 mmHg of pre-op'] },
  consciousness: { criterion: 'Consciousness', scores: ['0 — Not responding', '1 — Arousable on calling', '2 — Fully awake'] },
  o2Sat:         { criterion: 'O₂ Sat',        scores: ['0 — <90% with O₂', '1 — Needs O₂ to maintain ≥92%', '2 — ≥92% on room air'] },
};

// ── uid generator ────────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Default state ────────────────────────────────────────────────
function defaultPostOpData(): PostOpData {
  return {
    pacu: {
      aldrete: { activity: 0, respiration: 0, circulation: 0, consciousness: 0, o2Sat: 0 },
      vitals: [],
      dischargeCriteria: {
        aldreteGe8: false, painControlled: false, nvResolved: false,
        voided: false, ambulating: false,
      },
      pacuNotes: '',
    },
    wound: {
      type: '', closure: '', condition: '', woundNotes: '',
      drains: [], dressings: [],
    },
    complications: {
      ssiSuperficial: false, ssiDeep: false, ssiOrganSpace: false,
      anastomoticLeak: false, dvtStatus: '', peStatus: '',
      readmission: false, readmissionDate: '', readmissionReason: '',
      otherComplication: '', clavienDindo: '',
    },
    discharge: {
      painOralMeds: false, toleratingDiet: false, ambulating: false,
      woundInstructions: false, followUpScheduled: false, prescriptionsGiven: false,
      activityRestrictions: false, returnPrecautions: false,
      dischargeNotes: '',
    },
    followUp: {
      entries: [], pathologyStatus: '', pathologyNotes: '', surveillanceNotes: '',
    },
  };
}

// ── Deep merge utility ────────────────────────────────────────────
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const out = { ...target };
  for (const key in source) {
    const sv = source[key as keyof T];
    const tv = target[key as keyof T];
    if (sv !== null && typeof sv === 'object' && !Array.isArray(sv) && typeof tv === 'object' && !Array.isArray(tv)) {
      (out as any)[key] = deepMerge(tv as any, sv as any);
    } else if (sv !== undefined) {
      (out as any)[key] = sv;
    }
  }
  return out;
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
  card:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, marginBottom: 10 } as React.CSSProperties,
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

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 7,
        border: '1px solid rgba(201,169,110,0.25)',
        background: 'rgba(201,169,110,0.07)',
        color: '#c9a96e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Remove"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)',
        background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
      }}
    >
      <Trash2 size={13} />
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function PostOpModule({ patientId, encounterId, orgId, procedure }: Props) {
  const [data, setData] = useState<PostOpData>(defaultPostOpData());
  const [open, setOpen] = useState<Record<string, boolean>>({
    pacu: true, wound: false, complications: false, discharge: false, followUp: false,
  });
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [loading, setLoading] = useState(true);

  // ── Determine procedure template ───────────────────────────────
  const procKey = procedure ? Object.keys(PROCEDURE_TEMPLATES).find(k =>
    procedure.toLowerCase().includes(k)
  ) : undefined;
  const procTemplate = procKey ? PROCEDURE_TEMPLATES[procKey] : undefined;

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
          .eq('note_type', 'postop_note')
          .order('created_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          try {
            const parsed = JSON.parse(rows[0].note_text);
            setData(prev => deepMerge(prev, parsed));
          } catch { /* keep defaults */ }
        }
      } catch { /* table may not exist yet */ }
      setLoading(false);
    }
    loadNote();
  }, [encounterId]);

  // ── Setters ────────────────────────────────────────────────────
  const set = useCallback(<K extends keyof PostOpData>(section: K, value: Partial<PostOpData[K]>) => {
    setData(prev => ({ ...prev, [section]: { ...(prev[section] as object), ...value } }));
  }, []);

  const setNested = useCallback(<K extends keyof PostOpData, SK extends keyof PostOpData[K]>(
    section: K, sub: SK, value: Partial<PostOpData[K][SK]>
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
        org_id:       orgId,
        patient_id:   patientId,
        encounter_id: encounterId,
        note_type:    'postop_note',
        note_text:    JSON.stringify(data),
        created_by:   user?.id ?? null,
      });
      setSaveMsg('Post-op note saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e: any) {
      setSaveErr(e.message ?? 'Save failed');
    }
    setSaving(false);
  };

  // ── Derived values ─────────────────────────────────────────────
  const aldreteTotal = Object.values(data.pacu.aldrete).reduce((a, b) => a + b, 0);
  const aldreteColor = aldreteTotal >= 9 ? '#10b981' : aldreteTotal >= 8 ? '#f59e0b' : '#ef4444';
  const aldreteReady = aldreteTotal >= 8;

  const dischargeItems  = Object.entries(data.discharge).filter(([k]) => k !== 'dischargeNotes');
  const dischargeDone   = dischargeItems.filter(([, v]) => v === true).length;
  const dischargeTotal  = dischargeItems.length;

  const hasAnyComplication = data.complications.ssiSuperficial || data.complications.ssiDeep ||
    data.complications.ssiOrganSpace || data.complications.anastomoticLeak ||
    data.complications.dvtStatus !== '' || data.complications.peStatus !== '' ||
    data.complications.readmission || data.complications.otherComplication !== '';

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
            Post-Operative Monitoring
          </h2>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>
            {procedure && <span style={{ color: 'rgba(201,169,110,0.7)', fontWeight: 600 }}>{procedure} · </span>}
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
              : <><Save size={14} /> Save Post-Op</>}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — PACU / RECOVERY MONITORING
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="pacu"
        title="Recovery / PACU Monitoring"
        icon={<Activity size={16} />}
        badge={
          <CBadge
            color={aldreteColor}
            label={`Aldrete ${aldreteTotal}/10`}
          />
        }
        open={open.pacu}
        onToggle={togglePanel}
      >

        {/* Modified Aldrete Score */}
        <div style={S.sectionTitle}>Modified Aldrete Score</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {(Object.keys(ALDRETE_LABELS) as (keyof AldreteScores)[]).map(key => {
            const info = ALDRETE_LABELS[key];
            const val  = data.pacu.aldrete[key];
            return (
              <div key={key} style={{ ...S.card, padding: 12 }}>
                <div style={{ color: 'rgba(201,169,110,0.85)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  {info.criterion}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {([0, 1, 2] as const).map(score => (
                    <label
                      key={score}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
                      onClick={() => setNested('pacu', 'aldrete', { [key]: score } as any)}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        border: `2px solid ${val === score ? '#c9a96e' : 'rgba(255,255,255,0.2)'}`,
                        background: val === score ? '#c9a96e' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {val === score && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#060e1c' }} />}
                      </div>
                      <span style={{ color: val === score ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                        {info.scores[score]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Aldrete total display */}
        <div style={{
          padding: '12px 18px', borderRadius: 10,
          background: `${aldreteColor}14`, border: `1px solid ${aldreteColor}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
        }}>
          <div>
            <span style={{ color: aldreteColor, fontSize: 22, fontWeight: 800 }}>{aldreteTotal}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginLeft: 6 }}>/ 10</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: aldreteColor, fontSize: 13, fontWeight: 700 }}>
              {aldreteReady ? 'Ready for PACU discharge' : 'Not yet ready for discharge'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
              Score ≥8 required · ≥9 optimal
            </div>
          </div>
        </div>

        {/* Vital Signs Log */}
        <div style={{ ...S.sectionTitle as React.CSSProperties, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Vital Signs Log</span>
          <AddButton
            label="Add Entry"
            onClick={() => {
              const now = new Date();
              const ts  = now.toISOString().slice(0, 16);
              const entry: VitalEntry = { id: uid(), timestamp: ts, bp: '', hr: '', rr: '', spo2: '', temp: '', pain: '' };
              set('pacu', { vitals: [...data.pacu.vitals, entry] });
            }}
          />
        </div>

        {data.pacu.vitals.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>
            No vital sign entries yet. Click "Add Entry" to log vitals.
          </div>
        )}

        {data.pacu.vitals.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {['Time', 'BP', 'HR', 'RR', 'SpO₂', 'Temp', 'Pain', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '5px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pacu.vitals.map((v, i) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '5px 6px' }}>
                      <input
                        type="datetime-local"
                        value={v.timestamp}
                        onChange={e => {
                          const updated = data.pacu.vitals.map((x, j) => j === i ? { ...x, timestamp: e.target.value } : x);
                          set('pacu', { vitals: updated });
                        }}
                        style={{ ...S.input, fontSize: 11, padding: '3px 6px', width: 160 }}
                      />
                    </td>
                    {(['bp', 'hr', 'rr', 'spo2', 'temp', 'pain'] as const).map(field => (
                      <td key={field} style={{ padding: '5px 6px' }}>
                        <input
                          value={v[field]}
                          onChange={e => {
                            const updated = data.pacu.vitals.map((x, j) => j === i ? { ...x, [field]: e.target.value } : x);
                            set('pacu', { vitals: updated });
                          }}
                          placeholder="—"
                          style={{ ...S.input, fontSize: 11, padding: '3px 6px', width: field === 'bp' ? 90 : 60 }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '5px 6px' }}>
                      <DeleteButton onClick={() => set('pacu', { vitals: data.pacu.vitals.filter((_, j) => j !== i) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Discharge Criteria */}
        <div style={S.sectionTitle}>PACU Discharge Criteria</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <Checkbox
            checked={data.pacu.dischargeCriteria.aldreteGe8}
            onChange={v => setNested('pacu', 'dischargeCriteria', { aldreteGe8: v })}
            label="Aldrete score ≥8"
          />
          <Checkbox
            checked={data.pacu.dischargeCriteria.painControlled}
            onChange={v => setNested('pacu', 'dischargeCriteria', { painControlled: v })}
            label="Pain controlled (≤4/10 or at goal)"
          />
          <Checkbox
            checked={data.pacu.dischargeCriteria.nvResolved}
            onChange={v => setNested('pacu', 'dischargeCriteria', { nvResolved: v })}
            label="Nausea / vomiting resolved"
          />
          <Checkbox
            checked={data.pacu.dischargeCriteria.voided}
            onChange={v => setNested('pacu', 'dischargeCriteria', { voided: v })}
            label="Voided or foley in place"
          />
          <Checkbox
            checked={data.pacu.dischargeCriteria.ambulating}
            onChange={v => setNested('pacu', 'dischargeCriteria', { ambulating: v })}
            label="Ambulating or cleared by nursing"
          />
        </div>

        {Object.values(data.pacu.dischargeCriteria).every(Boolean) && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={15} color="#10b981" />
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>All PACU discharge criteria met.</span>
          </div>
        )}

        <Field label="PACU Notes">
          <textarea
            value={data.pacu.pacuNotes}
            onChange={e => set('pacu', { pacuNotes: e.target.value })}
            placeholder="PACU course, events, medications given, anesthesia notes…"
            rows={3}
            style={S.textarea}
          />
        </Field>
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — WOUND & DRAIN MANAGEMENT
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="wound"
        title="Wound & Drain Management"
        icon={<Stethoscope size={16} />}
        badge={
          data.wound.condition && data.wound.condition !== 'intact'
            ? <CBadge color="#f97316" label={data.wound.condition} />
            : data.wound.condition === 'intact'
            ? <CBadge color="#10b981" label="Intact" />
            : undefined
        }
        open={open.wound}
        onToggle={togglePanel}
      >

        {/* Wound Assessment */}
        <div style={S.sectionTitle}>Wound Assessment</div>
        <div style={S.row3}>
          <Field label="Wound Type">
            <select
              value={data.wound.type}
              onChange={e => set('wound', { type: e.target.value as WoundType })}
              style={S.select}
            >
              <option value="">Select…</option>
              <option value="primary">Primary intention</option>
              <option value="secondary">Secondary intention</option>
            </select>
          </Field>
          <Field label="Closure Method">
            <select
              value={data.wound.closure}
              onChange={e => set('wound', { closure: e.target.value as WoundClosure })}
              style={S.select}
            >
              <option value="">Select…</option>
              <option value="staples">Staples</option>
              <option value="sutures">Sutures</option>
              <option value="steri-strips">Steri-Strips</option>
              <option value="vacuum">Vacuum-assisted closure (VAC)</option>
            </select>
          </Field>
          <Field label="Wound Condition">
            <select
              value={data.wound.condition}
              onChange={e => set('wound', { condition: e.target.value as WoundCondition })}
              style={S.select}
            >
              <option value="">Select…</option>
              <option value="intact">Intact / healing well</option>
              <option value="seroma">Seroma</option>
              <option value="hematoma">Hematoma</option>
              <option value="infection">Wound infection / SSI</option>
              <option value="dehiscence">Dehiscence</option>
            </select>
          </Field>
        </div>

        {data.wound.condition && data.wound.condition !== 'intact' && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color="#f97316" />
            <span style={{ color: '#f97316', fontSize: 12 }}>
              Wound complication documented — consider updating Complication Tracking section.
            </span>
          </div>
        )}

        <Field label="Wound Notes">
          <textarea
            value={data.wound.woundNotes}
            onChange={e => set('wound', { woundNotes: e.target.value })}
            placeholder="Wound appearance, size, depth, drainage, odor, surrounding tissue…"
            rows={3}
            style={S.textarea}
          />
        </Field>

        {/* Drain Tracking */}
        <div style={{ ...S.sectionTitle as React.CSSProperties, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Drain Tracking</span>
          <AddButton
            label="Add Drain"
            onClick={() => {
              const drain: DrainEntry = { id: uid(), type: '', location: '', removalDate: '', outputs: [] };
              set('wound', { drains: [...data.wound.drains, drain] });
            }}
          />
        </div>

        {data.wound.drains.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontStyle: 'italic', padding: '4px 0 8px' }}>
            No drains recorded.
          </div>
        )}

        {data.wound.drains.map((drain, di) => (
          <div key={drain.id} style={{ ...S.card, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: '#c9a96e', fontSize: 12, fontWeight: 700 }}>Drain {di + 1}</span>
              <DeleteButton onClick={() => set('wound', { drains: data.wound.drains.filter(d => d.id !== drain.id) })} />
            </div>
            <div style={S.row3}>
              <Field label="Drain Type">
                <input
                  value={drain.type}
                  onChange={e => {
                    const updated = data.wound.drains.map(d => d.id === drain.id ? { ...d, type: e.target.value } : d);
                    set('wound', { drains: updated });
                  }}
                  placeholder="JP, Blake, Penrose…"
                  style={S.input}
                />
              </Field>
              <Field label="Location">
                <input
                  value={drain.location}
                  onChange={e => {
                    const updated = data.wound.drains.map(d => d.id === drain.id ? { ...d, location: e.target.value } : d);
                    set('wound', { drains: updated });
                  }}
                  placeholder="e.g. RUQ, pelvis…"
                  style={S.input}
                />
              </Field>
              <Field label="Removal Date">
                <input
                  type="date"
                  value={drain.removalDate}
                  onChange={e => {
                    const updated = data.wound.drains.map(d => d.id === drain.id ? { ...d, removalDate: e.target.value } : d);
                    set('wound', { drains: updated });
                  }}
                  style={S.input}
                />
              </Field>
            </div>

            {/* Daily output log */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Daily Output Log</span>
                <AddButton
                  label="Add Output"
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const output = { date: today, amount: '', character: '' };
                    const updated = data.wound.drains.map(d =>
                      d.id === drain.id ? { ...d, outputs: [...d.outputs, output] } : d
                    );
                    set('wound', { drains: updated });
                  }}
                />
              </div>
              {drain.outputs.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontStyle: 'italic' }}>No output entries.</div>
              )}
              {drain.outputs.map((out, oi) => (
                <div key={oi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 6, alignItems: 'end' }}>
                  <div>
                    <span style={{ ...S.label, marginTop: 0 }}>Date</span>
                    <input
                      type="date"
                      value={out.date}
                      onChange={e => {
                        const updated = data.wound.drains.map(d => {
                          if (d.id !== drain.id) return d;
                          const outs = d.outputs.map((o, j) => j === oi ? { ...o, date: e.target.value } : o);
                          return { ...d, outputs: outs };
                        });
                        set('wound', { drains: updated });
                      }}
                      style={{ ...S.input, fontSize: 11, padding: '4px 8px' }}
                    />
                  </div>
                  <div>
                    <span style={{ ...S.label, marginTop: 0 }}>Amount (mL)</span>
                    <input
                      value={out.amount}
                      onChange={e => {
                        const updated = data.wound.drains.map(d => {
                          if (d.id !== drain.id) return d;
                          const outs = d.outputs.map((o, j) => j === oi ? { ...o, amount: e.target.value } : o);
                          return { ...d, outputs: outs };
                        });
                        set('wound', { drains: updated });
                      }}
                      placeholder="e.g. 45"
                      style={{ ...S.input, fontSize: 11, padding: '4px 8px' }}
                    />
                  </div>
                  <div>
                    <span style={{ ...S.label, marginTop: 0 }}>Character</span>
                    <input
                      value={out.character}
                      onChange={e => {
                        const updated = data.wound.drains.map(d => {
                          if (d.id !== drain.id) return d;
                          const outs = d.outputs.map((o, j) => j === oi ? { ...o, character: e.target.value } : o);
                          return { ...d, outputs: outs };
                        });
                        set('wound', { drains: updated });
                      }}
                      placeholder="Serosanguinous, clear…"
                      style={{ ...S.input, fontSize: 11, padding: '4px 8px' }}
                    />
                  </div>
                  <DeleteButton onClick={() => {
                    const updated = data.wound.drains.map(d => {
                      if (d.id !== drain.id) return d;
                      return { ...d, outputs: d.outputs.filter((_, j) => j !== oi) };
                    });
                    set('wound', { drains: updated });
                  }} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Dressing Change Log */}
        <div style={{ ...S.sectionTitle as React.CSSProperties, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Dressing Change Log</span>
          <AddButton
            label="Add Entry"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              const entry: DressingEntry = { id: uid(), date: today, performedBy: '', notes: '' };
              set('wound', { dressings: [...data.wound.dressings, entry] });
            }}
          />
        </div>

        {data.wound.dressings.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontStyle: 'italic', padding: '4px 0 8px' }}>
            No dressing changes recorded.
          </div>
        )}

        {data.wound.dressings.map((d, i) => (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div>
              <span style={{ ...S.label, marginTop: 0 }}>Date</span>
              <input
                type="date"
                value={d.date}
                onChange={e => {
                  const updated = data.wound.dressings.map((x, j) => j === i ? { ...x, date: e.target.value } : x);
                  set('wound', { dressings: updated });
                }}
                style={{ ...S.input, fontSize: 11, padding: '4px 8px' }}
              />
            </div>
            <div>
              <span style={{ ...S.label, marginTop: 0 }}>Performed By</span>
              <input
                value={d.performedBy}
                onChange={e => {
                  const updated = data.wound.dressings.map((x, j) => j === i ? { ...x, performedBy: e.target.value } : x);
                  set('wound', { dressings: updated });
                }}
                placeholder="Clinician name / role"
                style={{ ...S.input, fontSize: 11, padding: '4px 8px' }}
              />
            </div>
            <div>
              <span style={{ ...S.label, marginTop: 0 }}>Notes</span>
              <input
                value={d.notes}
                onChange={e => {
                  const updated = data.wound.dressings.map((x, j) => j === i ? { ...x, notes: e.target.value } : x);
                  set('wound', { dressings: updated });
                }}
                placeholder="Wound appearance, dressing type used…"
                style={{ ...S.input, fontSize: 11, padding: '4px 8px' }}
              />
            </div>
            <DeleteButton onClick={() => set('wound', { dressings: data.wound.dressings.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — COMPLICATION TRACKING
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="complications"
        title="Complication Tracking"
        icon={<ShieldAlert size={16} />}
        badge={
          hasAnyComplication
            ? <CBadge color="#ef4444" label="Complications documented" />
            : <CBadge color="#10b981" label="No complications" />
        }
        open={open.complications}
        onToggle={togglePanel}
      >

        {/* SSI */}
        <div style={S.sectionTitle}>Surgical Site Infection (SSI)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <Checkbox
            checked={data.complications.ssiSuperficial}
            onChange={v => set('complications', { ssiSuperficial: v })}
            label="Superficial incisional SSI"
          />
          <Checkbox
            checked={data.complications.ssiDeep}
            onChange={v => set('complications', { ssiDeep: v })}
            label="Deep incisional SSI"
          />
          <Checkbox
            checked={data.complications.ssiOrganSpace}
            onChange={v => set('complications', { ssiOrganSpace: v })}
            label="Organ/space SSI"
          />
        </div>

        {/* Other Complications */}
        <div style={S.sectionTitle}>Other Complications</div>
        <Checkbox
          checked={data.complications.anastomoticLeak}
          onChange={v => set('complications', { anastomoticLeak: v })}
          label="Anastomotic leak"
        />

        <div style={{ ...S.row2, marginTop: 8 }}>
          <Field label="DVT">
            <select
              value={data.complications.dvtStatus}
              onChange={e => set('complications', { dvtStatus: e.target.value as DvtStatus })}
              style={S.select}
            >
              <option value="">None / not suspected</option>
              <option value="suspected">Suspected DVT</option>
              <option value="confirmed">Confirmed DVT</option>
            </select>
          </Field>
          <Field label="PE (Pulmonary Embolism)">
            <select
              value={data.complications.peStatus}
              onChange={e => set('complications', { peStatus: e.target.value as DvtStatus })}
              style={S.select}
            >
              <option value="">None / not suspected</option>
              <option value="suspected">Suspected PE</option>
              <option value="confirmed">Confirmed PE</option>
            </select>
          </Field>
        </div>

        {/* Readmission */}
        <div style={S.sectionTitle}>Readmission</div>
        <Checkbox
          checked={data.complications.readmission}
          onChange={v => set('complications', { readmission: v })}
          label="Patient was readmitted"
        />
        {data.complications.readmission && (
          <div style={{ ...S.row2, marginTop: 8 }}>
            <Field label="Readmission Date">
              <input
                type="date"
                value={data.complications.readmissionDate}
                onChange={e => set('complications', { readmissionDate: e.target.value })}
                style={S.input}
              />
            </Field>
            <Field label="Reason for Readmission">
              <input
                value={data.complications.readmissionReason}
                onChange={e => set('complications', { readmissionReason: e.target.value })}
                placeholder="e.g. wound infection, ileus, dehydration…"
                style={S.input}
              />
            </Field>
          </div>
        )}

        {/* Other / Free text */}
        <Field label="Other Complication (free text)">
          <textarea
            value={data.complications.otherComplication}
            onChange={e => set('complications', { otherComplication: e.target.value })}
            placeholder="Describe any additional complication not listed above…"
            rows={2}
            style={S.textarea}
          />
        </Field>

        {/* Clavien-Dindo */}
        <div style={S.sectionTitle}>Clavien-Dindo Classification</div>
        <Field label="Grade">
          <select
            value={data.complications.clavienDindo}
            onChange={e => set('complications', { clavienDindo: e.target.value as ClavienDindo })}
            style={S.select}
          >
            <option value="">— Not applicable / no complication —</option>
            {(['I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V'] as ClavienDindo[]).map(g => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
        </Field>
        {data.complications.clavienDindo && (
          <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 700 }}>Grade {data.complications.clavienDindo}:</span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginLeft: 8 }}>
              {CLAVIEN_DESCRIPTIONS[data.complications.clavienDindo]}
            </span>
          </div>
        )}
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — DISCHARGE CHECKLIST
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="discharge"
        title="Discharge Checklist"
        icon={<ClipboardList size={16} />}
        badge={
          <CBadge
            color={dischargeDone === dischargeTotal ? '#10b981' : dischargeDone > 0 ? '#f59e0b' : '#64748b'}
            label={`${dischargeDone}/${dischargeTotal}`}
          />
        }
        open={open.discharge}
        onToggle={togglePanel}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 8 }}>
          <Checkbox
            checked={data.discharge.painOralMeds}
            onChange={v => set('discharge', { painOralMeds: v })}
            label="Pain controlled on oral medications"
          />
          <Checkbox
            checked={data.discharge.toleratingDiet}
            onChange={v => set('discharge', { toleratingDiet: v })}
            label="Tolerating oral diet / fluids"
          />
          <Checkbox
            checked={data.discharge.ambulating}
            onChange={v => set('discharge', { ambulating: v })}
            label="Ambulating independently or with assistance"
          />
          <Checkbox
            checked={data.discharge.woundInstructions}
            onChange={v => set('discharge', { woundInstructions: v })}
            label="Written wound care instructions given"
          />
          <Checkbox
            checked={data.discharge.followUpScheduled}
            onChange={v => set('discharge', { followUpScheduled: v })}
            label="Follow-up appointment scheduled"
          />
          <Checkbox
            checked={data.discharge.prescriptionsGiven}
            onChange={v => set('discharge', { prescriptionsGiven: v })}
            label="Discharge prescriptions provided"
          />
          <Checkbox
            checked={data.discharge.activityRestrictions}
            onChange={v => set('discharge', { activityRestrictions: v })}
            label="Activity restrictions reviewed with patient"
          />
          <Checkbox
            checked={data.discharge.returnPrecautions}
            onChange={v => set('discharge', { returnPrecautions: v })}
            label="Return precautions / warning signs reviewed"
          />
        </div>

        {dischargeDone === dischargeTotal && (
          <div style={{ marginTop: 14, padding: '10px 16px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#10b981" />
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>All discharge criteria complete — patient ready for discharge.</span>
          </div>
        )}

        {dischargeDone < dischargeTotal && dischargeDone > 0 && (
          <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color="#f59e0b" />
            <span style={{ color: '#f59e0b', fontSize: 12 }}>
              {dischargeTotal - dischargeDone} discharge item{dischargeTotal - dischargeDone !== 1 ? 's' : ''} still pending.
            </span>
          </div>
        )}

        <Field label="Discharge Notes">
          <textarea
            value={data.discharge.dischargeNotes}
            onChange={e => set('discharge', { dischargeNotes: e.target.value })}
            placeholder="Discharge instructions summary, special considerations, care team notes…"
            rows={3}
            style={S.textarea}
          />
        </Field>
      </AccordionPanel>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — FOLLOW-UP SCHEDULING
      ══════════════════════════════════════════════════════════ */}
      <AccordionPanel
        id="followUp"
        title="Follow-up Scheduling"
        icon={<Calendar size={16} />}
        badge={
          data.followUp.pathologyStatus === 'abnormal'
            ? <CBadge color="#ef4444" label="Abnormal path" />
            : data.followUp.pathologyStatus === 'awaiting'
            ? <CBadge color="#f59e0b" label="Path pending" />
            : data.followUp.entries.length > 0
            ? <CBadge color="#3b82f6" label={`${data.followUp.entries.length} appt${data.followUp.entries.length !== 1 ? 's' : ''}`} />
            : undefined
        }
        open={open.followUp}
        onToggle={togglePanel}
      >

        {/* Procedure-specific defaults */}
        {procTemplate && (
          <div style={{ marginTop: 8, marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.18)' }}>
            <div style={{ color: '#c9a96e', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              Recommended Follow-up: {procTemplate.label}
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
              {procTemplate.intervals.map((intv, i) => (
                <li key={i} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4 }}>{intv}</li>
              ))}
            </ul>
            {procTemplate.surveillance && procTemplate.surveillance.length > 0 && (
              <>
                <div style={{ color: 'rgba(201,169,110,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 10, marginBottom: 5 }}>
                  Surveillance Reminders
                </div>
                <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                  {procTemplate.surveillance.map((s, i) => (
                    <li key={i} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 3 }}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Follow-up Appointments */}
        <div style={{ ...S.sectionTitle as React.CSSProperties, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Follow-up Appointments</span>
          <AddButton
            label="Add Appointment"
            onClick={() => {
              const entry: FollowUpEntry = { id: uid(), date: '', purpose: '', completed: false, notes: '' };
              set('followUp', { entries: [...data.followUp.entries, entry] });
            }}
          />
        </div>

        {data.followUp.entries.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontStyle: 'italic', padding: '4px 0 8px' }}>
            No follow-up appointments scheduled yet.
          </div>
        )}

        {data.followUp.entries.map((entry, i) => (
          <div key={entry.id} style={{ ...S.card, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <span style={{ ...S.label, marginTop: 0 }}>Date</span>
                <input
                  type="date"
                  value={entry.date}
                  onChange={e => {
                    const updated = data.followUp.entries.map((x, j) => j === i ? { ...x, date: e.target.value } : x);
                    set('followUp', { entries: updated });
                  }}
                  style={{ ...S.input, fontSize: 12 }}
                />
              </div>
              <div>
                <span style={{ ...S.label, marginTop: 0 }}>Purpose / Visit Type</span>
                <input
                  value={entry.purpose}
                  onChange={e => {
                    const updated = data.followUp.entries.map((x, j) => j === i ? { ...x, purpose: e.target.value } : x);
                    set('followUp', { entries: updated });
                  }}
                  placeholder="e.g. wound check, path results, oncology surveillance…"
                  style={{ ...S.input, fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={entry.completed}
                    onChange={e => {
                      const updated = data.followUp.entries.map((x, j) => j === i ? { ...x, completed: e.target.checked } : x);
                      set('followUp', { entries: updated });
                    }}
                    style={{ accentColor: '#c9a96e', width: 14, height: 14 }}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, whiteSpace: 'nowrap' }}>Done</span>
                </label>
                <DeleteButton onClick={() => set('followUp', { entries: data.followUp.entries.filter((_, j) => j !== i) })} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ ...S.label, marginTop: 0 }}>Visit Notes</span>
              <textarea
                value={entry.notes}
                onChange={e => {
                  const updated = data.followUp.entries.map((x, j) => j === i ? { ...x, notes: e.target.value } : x);
                  set('followUp', { entries: updated });
                }}
                placeholder="Findings, instructions, plan from visit…"
                rows={2}
                style={{ ...S.textarea, fontSize: 12 }}
              />
            </div>
          </div>
        ))}

        {/* Pathology Results */}
        <div style={S.sectionTitle}>Pathology Results</div>
        <div style={S.row2}>
          <Field label="Pathology Status">
            <select
              value={data.followUp.pathologyStatus}
              onChange={e => set('followUp', { pathologyStatus: e.target.value as PathologyStatus })}
              style={S.select}
            >
              <option value="">N/A — no specimen sent</option>
              <option value="awaiting">Awaiting results</option>
              <option value="received">Received (review pending)</option>
              <option value="normal">Normal / benign</option>
              <option value="abnormal">Abnormal — requires action</option>
            </select>
          </Field>
          <div />
        </div>

        {data.followUp.pathologyStatus === 'awaiting' && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={13} color="#f59e0b" />
            <span style={{ color: '#f59e0b', fontSize: 12 }}>Pathology results pending — schedule results appointment.</span>
          </div>
        )}
        {data.followUp.pathologyStatus === 'abnormal' && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={13} color="#ef4444" />
            <span style={{ color: '#ef4444', fontSize: 12 }}>Abnormal pathology — oncology referral or adjuvant therapy planning may be required.</span>
          </div>
        )}

        <Field label="Pathology Notes">
          <textarea
            value={data.followUp.pathologyNotes}
            onChange={e => set('followUp', { pathologyNotes: e.target.value })}
            placeholder="Specimen description, diagnosis, margin status, lymph nodes, grade/stage if applicable…"
            rows={3}
            style={S.textarea}
          />
        </Field>

        {/* Surveillance Reminders */}
        <div style={S.sectionTitle}>Surveillance Reminders</div>
        <Field label="Surveillance Notes">
          <textarea
            value={data.followUp.surveillanceNotes}
            onChange={e => set('followUp', { surveillanceNotes: e.target.value })}
            placeholder="Scheduled CT scans, colonoscopy, tumor markers, imaging intervals, referral plans…"
            rows={3}
            style={S.textarea}
          />
        </Field>

        {/* Surveillance quick reference by procedure */}
        {procTemplate?.surveillance && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <FlaskConical size={13} color="#3b82f6" />
              <span style={{ color: '#3b82f6', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Guideline-Based Surveillance — {procTemplate.label}
              </span>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
              {procTemplate.surveillance.map((s, i) => (
                <li key={i} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 3 }}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </AccordionPanel>

      {/* ── Footer save ───────────────────────────────────────────── */}
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
            : <><Save size={15} /> Save Post-Op Documentation</>}
        </button>
      </div>

      {/* Recovery-phase MAR — same shared case spine the OR app reads */}
      <MARPanel caseId={Number(patientId) || null} orgId={orgId} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
