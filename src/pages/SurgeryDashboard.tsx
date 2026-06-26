import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { STAGE_ICONS, MODULE_MARKS } from '../components/surgery/MedicalIcons'
import { ClinicalChart } from '@patienttrac/clinical-viewer'

const PreOpModule    = lazy(() => import('../components/surgery/PreOpModule'))
const OperativeModule = lazy(() => import('../components/surgery/OperativeModule'))
const PostOpModule   = lazy(() => import('../components/surgery/PostOpModule'))

// ── Types ──────────────────────────────────────────────────────────────────
type FlowStage = 'preop' | 'inor' | 'pacu' | 'ward' | 'discharge'
type Urgency = 'routine' | 'urgent' | 'stat'

interface PatientCard {
  id: string             // case_id (string) — drives the case spine
  patientId: string | null  // real cr.patients id — drives the shared clinical chart
  name: string
  procedure: string
  surgeon: string
  stage: FlowStage
  timeInStage: number   // minutes
  urgency: Urgency
  room?: string
  age: number
}

interface ScheduledCase {
  id: string
  time: string
  room: string
  procedure: string
  patient: string
  surgeon: string
  duration: number     // minutes
  status: 'scheduled' | 'in_progress' | 'completed' | 'delayed'
}

interface CompletedCase {
  id: string
  patient: string
  procedure: string
  surgeon: string
  completedAt: string
  totalTime: number    // minutes
  outcome: 'routine' | 'complication_noted' | 'extended'
}

interface QuickStats {
  totalCasesToday: number
  inOrNow: number
  pacuOccupancy: number
  pacuCapacity: number
  avgOrTime: number
}

// ── DB row shape — unified case spine (cr.or_cases, shared with the OR app) ─
interface CaseRow {
  case_id: number
  patient_id: string | null
  procedure_name: string
  surgeon_name: string
  urgency: string
  stage: string
  stage_entered_at: string
  scheduled_start: string | null
  or_room: string | null
  estimated_duration_minutes: number
  schedule_status: string
  completed_at: string | null
  total_time_min: number | null
  outcome: string | null
  patient_name: string
  patient_age: number | null
}

function minsInStage(enteredAt: string): number {
  return Math.floor((Date.now() - new Date(enteredAt).getTime()) / 60000)
}

function fmtClock(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function rowToPatientCard(r: CaseRow): PatientCard {
  return {
    id:           String(r.case_id),
    patientId:    r.patient_id,
    name:         r.patient_name,
    procedure:    r.procedure_name,
    surgeon:      r.surgeon_name,
    stage:        r.stage as FlowStage,
    timeInStage:  minsInStage(r.stage_entered_at),
    urgency:      r.urgency as Urgency,
    room:         r.or_room ?? undefined,
    age:          r.patient_age ?? 0,
  }
}

function rowToScheduled(r: CaseRow): ScheduledCase {
  return {
    id:        String(r.case_id),
    time:      fmtClock(r.scheduled_start),
    room:      r.or_room ?? '—',
    procedure: r.procedure_name,
    patient:   r.patient_name,
    surgeon:   r.surgeon_name,
    duration:  r.estimated_duration_minutes,
    status:    r.schedule_status as ScheduledCase['status'],
  }
}

function rowToCompleted(r: CaseRow): CompletedCase {
  return {
    id:          String(r.case_id),
    patient:     r.patient_name,
    procedure:   r.procedure_name,
    surgeon:     r.surgeon_name,
    completedAt: fmtClock(r.completed_at),
    totalTime:   r.total_time_min ?? 0,
    outcome:     (r.outcome ?? 'routine') as CompletedCase['outcome'],
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function urgencyColor(u: Urgency): string {
  if (u === 'stat')   return '#ef4444'
  if (u === 'urgent') return '#f59e0b'
  return '#3a4a6a'
}

function urgencyBg(u: Urgency): string {
  if (u === 'stat')   return 'rgba(239,68,68,0.12)'
  if (u === 'urgent') return 'rgba(245,158,11,0.12)'
  return 'rgba(58,74,106,0.3)'
}

function stageLabel(s: FlowStage): string {
  const map: Record<FlowStage, string> = {
    preop: 'Pre-Op', inor: 'In OR', pacu: 'PACU', ward: 'Ward / ICU', discharge: 'Discharge',
  }
  return map[s]
}

// Ordered flow of the unified case spine. The DB state machine
// (public.advance_case_stage) accepts any of these as a target; the UI walks
// one step at a time, forward or — for corrections — back.
const STAGE_FLOW: FlowStage[] = ['preop', 'inor', 'pacu', 'ward', 'discharge']
function nextStage(s: FlowStage): FlowStage | null {
  const i = STAGE_FLOW.indexOf(s)
  return i >= 0 && i < STAGE_FLOW.length - 1 ? STAGE_FLOW[i + 1] : null
}
function prevStage(s: FlowStage): FlowStage | null {
  const i = STAGE_FLOW.indexOf(s)
  return i > 0 ? STAGE_FLOW[i - 1] : null
}

function statusColor(s: ScheduledCase['status']): string {
  const map = { scheduled: '#8a9bc0', in_progress: '#4ade80', completed: '#3a4a6a', delayed: '#f59e0b' }
  return map[s]
}

function statusLabel(s: ScheduledCase['status']): string {
  const map = { scheduled: 'SCHED', in_progress: 'LIVE', completed: 'DONE', delayed: 'DELAYED' }
  return map[s]
}

function outcomeColor(o: CompletedCase['outcome']): string {
  if (o === 'complication_noted') return '#f59e0b'
  if (o === 'extended')           return '#a78bfa'
  return '#4ade80'
}

function outcomeLabel(o: CompletedCase['outcome']): string {
  if (o === 'complication_noted') return 'NOTE'
  if (o === 'extended')           return 'EXT'
  return 'OK'
}

// ── Style constants ─────────────────────────────────────────────────────────
const C = {
  bg:       '#060e1c',
  card:     '#0a1628',
  gold:     '#c9a96e',
  goldFaint:'rgba(201,169,110,0.08)',
  goldBorder:'rgba(201,169,110,0.15)',
  text:     '#e8eaf0',
  muted:    '#8a9bc0',
  dim:      '#3a4a6a',
  preop:    '#3b82f6',
  preopBg:  'rgba(59,130,246,0.1)',
  inor:     '#ef4444',
  inorBg:   'rgba(239,68,68,0.1)',
  pacu:     '#f59e0b',
  pacuBg:   'rgba(245,158,11,0.1)',
  ward:     '#4ade80',
  wardBg:   'rgba(74,222,128,0.1)',
  discharge:'#94a3b8',
  dischargeBg:'rgba(148,163,184,0.1)',
} as const

function stageAccent(s: FlowStage): { color: string; bg: string } {
  const map: Record<FlowStage, { color: string; bg: string }> = {
    preop:    { color: C.preop,    bg: C.preopBg    },
    inor:     { color: C.inor,     bg: C.inorBg     },
    pacu:     { color: C.pacu,     bg: C.pacuBg     },
    ward:     { color: C.ward,     bg: C.wardBg     },
    discharge:{ color: C.discharge,bg: C.dischargeBg},
  }
  return map[s]
}

// ── Drawer ─────────────────────────────────────────────────────────────────
function PatientDrawer({ patient, orgId, onClose, onAdvance, advancing }: {
  patient: PatientCard | null
  orgId: string
  onClose: () => void
  onAdvance: (toStage: FlowStage) => void
  advancing: boolean
}) {
  const [showChart, setShowChart] = useState(false)
  if (!patient) return null

  const next = nextStage(patient.stage)
  const prev = prevStage(patient.stage)

  const moduleForStage = (stage: FlowStage) => {
    if (stage === 'preop')    return <PreOpModule    patientId={patient.id} encounterId={patient.id} orgId={orgId} />
    if (stage === 'inor')     return <OperativeModule patientId={patient.id} encounterId={patient.id} orgId={orgId} />
    if (stage === 'pacu' || stage === 'ward' || stage === 'discharge')
                              return <PostOpModule   patientId={patient.id} encounterId={patient.id} orgId={orgId} procedure={patient.procedure} />
    return null
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 'min(860px, 92vw)',
        background: '#060e1c',
        borderLeft: `1px solid rgba(201,169,110,0.2)`,
        boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Drawer header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#060e1c', borderBottom: `1px solid rgba(201,169,110,0.15)`,
          padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: 6,
              color: C.gold,
            }}>
              {MODULE_MARKS[patient.stage]({ size: 26 })}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>
                {patient.name}
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono,monospace', marginTop: 2 }}>
                {patient.procedure} · {patient.surgeon} · {stageLabel(patient.stage).toUpperCase()}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(201,169,110,0.08)', border: `1px solid rgba(201,169,110,0.2)`,
              color: C.muted, fontSize: 18, lineHeight: 1, padding: '6px 12px',
              cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            ×
          </button>
        </div>

        {/* Stage progression — drives the shared spine; the OR console sees the
            same move within ~a second via realtime. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '10px 24px', background: '#081020',
          borderBottom: `1px solid rgba(201,169,110,0.1)`,
        }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Stage · <span style={{ color: stageAccent(patient.stage).color }}>{stageLabel(patient.stage)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {prev && (
              <button disabled={advancing} onClick={() => onAdvance(prev)} style={stageBtnGhost}>
                ← {stageLabel(prev)}
              </button>
            )}
            {next ? (
              <button disabled={advancing} onClick={() => onAdvance(next)} style={stageBtnPrimary}>
                {advancing ? 'Saving…' : `Advance to ${stageLabel(next)} →`}
              </button>
            ) : (
              <span style={{
                fontSize: 11, fontFamily: 'DM Mono,monospace', letterSpacing: '0.06em',
                color: C.ward, background: 'rgba(74,222,128,0.12)', padding: '6px 12px',
              }}>
                ✓ Discharged
              </span>
            )}
          </div>
        </div>

        {/* Module content */}
        <div style={{ flex: 1, padding: 24 }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${C.dim}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          }>
            {moduleForStage(patient.stage)}
          </Suspense>

          {/* Shared clinical chart (@patienttrac/clinical-viewer) — keyed to the
              real cr.patients id, not the case_id. */}
          <div style={{ marginTop: 24, borderTop: `1px solid rgba(201,169,110,0.15)`, paddingTop: 18 }}>
            <button
              onClick={() => setShowChart(s => !s)}
              disabled={!patient.patientId}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: 'rgba(201,169,110,0.08)', border: `1px solid rgba(201,169,110,0.2)`,
                color: patient.patientId ? C.gold : C.dim, padding: '10px 14px',
                fontSize: 12, fontFamily: 'DM Mono,monospace', letterSpacing: '0.08em',
                textTransform: 'uppercase', cursor: patient.patientId ? 'pointer' : 'not-allowed',
              }}
            >
              {showChart ? '▾' : '▸'} Clinical Chart
              {!patient.patientId && <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>no linked patient record</span>}
            </button>
            {showChart && patient.patientId && (
              <div style={{ marginTop: 14, background: '#fff', borderRadius: 8, padding: 20 }}>
                <ClinicalChart patientId={Number(patient.patientId)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:C.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:36, height:36, border:`3px solid ${C.dim}`, borderTopColor:C.gold, borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:C.muted, fontSize:13, marginTop:14, fontFamily:'DM Mono,monospace', letterSpacing:'0.06em' }}>LOADING DASHBOARD</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize:10, fontFamily:'DM Mono,monospace', color:C.gold, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:12 }}>
      {children}
    </div>
  )
}

function PatientFlowCard({ patient, onClick, onDragStart, onDragEnd, dragging }: {
  patient: PatientCard
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const accent = stageAccent(patient.stage)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${C.goldBorder}`,
        padding: '12px 14px',
        cursor: 'grab',
        transition: 'border-color 0.15s, opacity 0.15s',
        opacity: dragging ? 0.4 : 1,
        minWidth: 0,
        position: 'relative',
        borderLeft: `3px solid ${accent.color}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = C.gold)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.goldBorder)}
    >
      {/* urgency badge */}
      {patient.urgency !== 'routine' && (
        <div style={{
          position:'absolute', top:8, right:8,
          background: urgencyBg(patient.urgency),
          color: urgencyColor(patient.urgency),
          fontSize:9, fontFamily:'DM Mono,monospace', letterSpacing:'0.1em',
          padding:'2px 6px', fontWeight:700,
        }}>
          {patient.urgency.toUpperCase()}
        </div>
      )}

      <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.02em', paddingRight: patient.urgency !== 'routine' ? 50 : 0 }}>
        {patient.name}
      </div>
      <div style={{ fontSize:11, color:C.muted, marginTop:3, lineHeight:1.4 }}>
        {patient.procedure}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10 }}>
        <div style={{ fontSize:10, color:C.dim, fontFamily:'DM Mono,monospace' }}>
          {patient.surgeon}
        </div>
        <div style={{ fontSize:10, color:accent.color, fontFamily:'DM Mono,monospace', background:accent.bg, padding:'2px 6px' }}>
          {fmtDuration(patient.timeInStage)}
        </div>
      </div>
      {patient.room && (
        <div style={{ fontSize:10, color:C.inor, fontFamily:'DM Mono,monospace', marginTop:4 }}>
          {patient.room}
        </div>
      )}
    </div>
  )
}

function FlowLane({ stage, patients, onClick, draggingId, isDropTarget, onCardDragStart, onCardDragEnd, onLaneDragOver, onLaneDragLeave, onLaneDrop }: {
  stage: FlowStage
  patients: PatientCard[]
  onClick: (p: PatientCard) => void
  draggingId: string | null
  isDropTarget: boolean
  onCardDragStart: (p: PatientCard) => void
  onCardDragEnd: () => void
  onLaneDragOver: () => void
  onLaneDragLeave: () => void
  onLaneDrop: () => void
}) {
  const accent = stageAccent(stage)
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onLaneDragOver() }}
      onDragLeave={onLaneDragLeave}
      onDrop={e => { e.preventDefault(); onLaneDrop() }}
      style={{ flex:1, minWidth:160, display:'flex', flexDirection:'column' }}
    >
      {/* Lane header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 12px',
        background: accent.bg,
        borderTop: `2px solid ${accent.color}`,
        marginBottom:8,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          {STAGE_ICONS[stage]({ size: 15, color: accent.color })}
          <span style={{ fontSize:11, fontFamily:'DM Mono,monospace', color:accent.color, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:600 }}>
            {stageLabel(stage)}
          </span>
        </div>
        <div style={{ fontSize:12, fontFamily:'DM Mono,monospace', color:accent.color, background:`rgba(0,0,0,0.3)`, padding:'1px 8px', borderRadius:2 }}>
          {patients.length}
        </div>
      </div>

      {/* Cards — also the drop zone (highlights when a card hovers a new lane) */}
      <div style={{
        display:'flex', flexDirection:'column', gap:8, flex:1, padding:4,
        border: isDropTarget ? `1px dashed ${C.gold}` : '1px solid transparent',
        background: isDropTarget ? 'rgba(201,169,110,0.05)' : 'transparent',
        transition: 'background 0.12s, border-color 0.12s',
      }}>
        {patients.length === 0 ? (
          <div style={{ padding:'20px 12px', textAlign:'center', color: isDropTarget ? C.gold : C.dim, fontSize:11, fontFamily:'DM Mono,monospace', border:`1px dashed rgba(58,74,106,0.3)` }}>
            {isDropTarget ? 'DROP HERE' : 'EMPTY'}
          </div>
        ) : (
          patients.map(p => (
            <PatientFlowCard
              key={p.id}
              patient={p}
              onClick={() => onClick(p)}
              onDragStart={() => onCardDragStart(p)}
              onDragEnd={onCardDragEnd}
              dragging={draggingId === p.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div style={{
      position:'fixed', bottom:28, right:28, zIndex:9999,
      background:'#0a1628', border:`1px solid ${C.goldBorder}`,
      boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
      padding:'14px 20px', maxWidth:360,
      display:'flex', alignItems:'center', gap:12,
    }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:C.gold, flexShrink:0 }} />
      <div style={{ color:C.text, fontSize:13, lineHeight:1.5 }}>{message}</div>
      <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:C.dim, cursor:'pointer', fontSize:16, lineHeight:1, padding:0 }}>
        ×
      </button>
    </div>
  )
}

// ── New Case modal ───────────────────────────────────────────────────────
function localNowValue(): string {
  // datetime-local wants 'YYYY-MM-DDTHH:mm' in LOCAL time.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface NewCaseForm {
  patient_name: string
  patient_age: string
  patient_mrn: string
  procedure_name: string
  surgeon_name: string
  or_room: string
  scheduled_start: string
  estimated_duration_minutes: string
  urgency: Urgency
  anesthesiologist_name: string
}

function NewCaseModal({ defaultSurgeon, onSubmit, onClose }: {
  defaultSurgeon: string
  onSubmit: (form: NewCaseForm) => Promise<boolean>
  onClose: () => void
}) {
  const [form, setForm] = useState<NewCaseForm>({
    patient_name: '', patient_age: '', patient_mrn: '',
    procedure_name: '', surgeon_name: defaultSurgeon, or_room: '',
    scheduled_start: localNowValue(), estimated_duration_minutes: '',
    urgency: 'routine', anesthesiologist_name: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof NewCaseForm>(k: K, v: NewCaseForm[K]) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.patient_name.trim() || !form.procedure_name.trim() || !form.surgeon_name.trim() || !form.or_room.trim()) {
      setErr('Patient, procedure, surgeon and OR room are required.')
      return
    }
    setErr(null)
    setSaving(true)
    const ok = await onSubmit(form)
    setSaving(false)
    if (!ok) setErr('Could not book the case — check connection and try again.')
  }

  const field = (label: string, node: React.ReactNode, req = false) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}{req && <span style={{ color: C.gold }}> *</span>}
      </span>
      {node}
    </label>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301,
        width: 'min(620px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
        background: '#0a1628', border: `1px solid ${C.goldBorder}`, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          position: 'sticky', top: 0, background: '#0a1628', borderBottom: `1px solid ${C.goldBorder}`,
          padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.gold, fontFamily: "'DM Sans',sans-serif", letterSpacing: '0.04em' }}>
            Book New Case
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {field('Patient Name', <input value={form.patient_name} onChange={e => set('patient_name', e.target.value)} style={modalInput} placeholder="Last, First" />, true)}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {field('Age', <input value={form.patient_age} onChange={e => set('patient_age', e.target.value.replace(/\D/g, ''))} style={modalInput} placeholder="—" inputMode="numeric" />)}
            {field('MRN', <input value={form.patient_mrn} onChange={e => set('patient_mrn', e.target.value)} style={modalInput} placeholder="optional" />)}
          </div>

          {field('Procedure', <input value={form.procedure_name} onChange={e => set('procedure_name', e.target.value)} style={modalInput} placeholder="e.g. Laparoscopic Cholecystectomy" />, true)}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {field('Surgeon', <input value={form.surgeon_name} onChange={e => set('surgeon_name', e.target.value)} style={modalInput} />, true)}
            {field('OR Room', <input value={form.or_room} onChange={e => set('or_room', e.target.value)} style={modalInput} placeholder="e.g. OR 3" />, true)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}>
            {field('Scheduled Start', <input type="datetime-local" value={form.scheduled_start} onChange={e => set('scheduled_start', e.target.value)} style={modalInput} />, true)}
            {field('Duration (min)', <input value={form.estimated_duration_minutes} onChange={e => set('estimated_duration_minutes', e.target.value.replace(/\D/g, ''))} style={modalInput} placeholder="—" inputMode="numeric" />)}
            {field('Urgency', (
              <select value={form.urgency} onChange={e => set('urgency', e.target.value as Urgency)} style={modalInput}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            ))}
          </div>

          {field('Anesthesiologist', <input value={form.anesthesiologist_name} onChange={e => set('anesthesiologist_name', e.target.value)} style={modalInput} placeholder="optional" />)}

          {err && <div style={{ fontSize: 12, color: '#fca5a5', fontFamily: 'DM Mono,monospace' }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={stageBtnGhost}>Cancel</button>
            <button onClick={submit} disabled={saving} style={stageBtnPrimary}>
              {saving ? 'Booking…' : 'Book Case'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
interface Props {
  orgId?: string
  providerName?: string
  onNavigateAdmin?: () => void
  onNavigateSettings?: () => void
}

export default function SurgeryDashboard({ orgId: orgIdProp = '', providerName = 'Dr. Okafor', onNavigateAdmin, onNavigateSettings }: Props) {
  const sessionOrgId = useAppStore(s => s.session?.org_id)
  const orgId = sessionOrgId || orgIdProp

  const [loading,    setLoading]    = useState(true)
  const [patients,   setPatients]   = useState<PatientCard[]>([])
  const [schedule,   setSchedule]   = useState<ScheduledCase[]>([])
  const [completed,  setCompleted]  = useState<CompletedCase[]>([])
  const [stats,      setStats]      = useState<QuickStats | null>(null)
  const [toast,      setToast]      = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'board' | 'schedule'>('board')
  const [drawerPatient, setDrawerPatient] = useState<PatientCard | null>(null)

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  const loadData = useCallback(async (currentOrgId: string) => {
    setLoading(true)
    try {
      const todayStr = new Date().toISOString().slice(0, 10)

      // Unified case spine — same cr.or_cases rows the OR app's live console uses
      const { data, error } = await supabase
        .from('or_cases')
        .select(`
          case_id, patient_id, procedure_name, surgeon_name, urgency, stage, stage_entered_at,
          scheduled_start, or_room, estimated_duration_minutes, schedule_status,
          completed_at, total_time_min, outcome, patient_name, patient_age
        `)
        .eq('org_id', currentOrgId)
        .eq('case_date', todayStr)
        .neq('stage', 'cancelled')
        .is('deleted_at', null)
        .order('scheduled_start', { ascending: true })

      if (error) throw error

      const rows: CaseRow[] = data ?? []
      const board    = rows.filter(r => !['cancelled'].includes(r.stage))
      const done     = rows.filter(r => r.schedule_status === 'completed').slice(-5).reverse()
      const sched    = rows.filter(r => !['cancelled'].includes(r.schedule_status))

      setPatients(board.map(rowToPatientCard))
      setSchedule(sched.map(rowToScheduled))
      setCompleted(done.map(rowToCompleted))

      const inOr   = rows.filter(r => r.stage === 'inor').length
      const inPacu = rows.filter(r => r.stage === 'pacu').length
      const completedRows = rows.filter(r => r.total_time_min)
      const avgOr  = completedRows.length
        ? Math.round(completedRows.reduce((s, r) => s + (r.total_time_min ?? 0), 0) / completedRows.length)
        : 0

      setStats({
        totalCasesToday: rows.length,
        inOrNow:         inOr,
        pacuOccupancy:   inPacu,
        pacuCapacity:    8,
        avgOrTime:       avgOr,
      })
    } catch (err) {
      console.error('loadData error:', err)
      setToast('Failed to load cases — check connection')
    }
    setLoading(false)
  }, [])

  // Initial load
  useEffect(() => {
    loadData(orgId)
  }, [orgId, loadData])

  // Realtime: re-fetch whenever any case on the shared spine changes.
  // Same publication the OR app's live console subscribes to — a status
  // change on the OR board appears here within ~a second, and vice versa.
  useEffect(() => {
    if (!orgId) return
    const channel = supabase
      .channel(`or_cases:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'cr', table: 'or_cases' },
        () => { loadData(orgId) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId, loadData])

  const [advancing, setAdvancing] = useState(false)
  const [showNewCase, setShowNewCase] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<FlowStage | null>(null)

  const handlePatientClick = (p: PatientCard) => {
    setDrawerPatient(p)
  }

  // Single move path used by both the drawer buttons and drag-and-drop. The DB
  // state machine accepts any target stage, so a drag across several lanes is
  // one call. Optimistically reflects on the board + open drawer; realtime and
  // the loadData refetch reconcile (and surface any server rejection).
  const moveCaseToStage = async (patient: PatientCard, toStage: FlowStage) => {
    if (patient.stage === toStage || advancing) return
    setAdvancing(true)
    const { error } = await supabase.rpc('advance_case_stage', {
      p_case_id: Number(patient.id),
      p_to_stage: toStage,
    })
    setAdvancing(false)
    if (error) {
      console.error('advance_case_stage error:', error)
      setToast(`Could not move ${patient.name} — ${error.message}`)
      return
    }
    setPatients(ps => ps.map(p => (p.id === patient.id ? { ...p, stage: toStage, timeInStage: 0 } : p)))
    setDrawerPatient(p => (p && p.id === patient.id ? { ...p, stage: toStage } : p))
    setToast(`${patient.name} → ${stageLabel(toStage)}`)
    loadData(orgId)
  }

  // Book a new case onto the shared spine. Attribution + case number are
  // resolved server-side by the RPC; the new case lands in Pre-Op and appears
  // on the board (and the OR app) via the realtime refetch below.
  const bookCase = async (form: NewCaseForm): Promise<boolean> => {
    const { error } = await supabase.rpc('book_case', {
      p_patient_name: form.patient_name.trim(),
      p_procedure_name: form.procedure_name.trim(),
      p_surgeon_name: form.surgeon_name.trim(),
      p_or_room: form.or_room.trim(),
      p_scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
      p_urgency: form.urgency,
      p_patient_age: form.patient_age ? Number(form.patient_age) : null,
      p_patient_mrn: form.patient_mrn.trim() || null,
      p_estimated_duration_minutes: form.estimated_duration_minutes ? Number(form.estimated_duration_minutes) : null,
      p_anesthesiologist_name: form.anesthesiologist_name.trim() || null,
    })
    if (error) {
      console.error('book_case error:', error)
      return false
    }
    setShowNewCase(false)
    setToast(`Case booked — ${form.patient_name.trim()}`)
    loadData(orgId)
    return true
  }

  const advanceCase = (toStage: FlowStage) => {
    if (drawerPatient) moveCaseToStage(drawerPatient, toStage)
  }

  const handleDropOnStage = (stage: FlowStage) => {
    const id = dragId
    setDragId(null)
    setDragOverStage(null)
    if (!id) return
    const p = patients.find(x => x.id === id)
    if (p) moveCaseToStage(p, stage)
  }

  const draggingStage = dragId ? patients.find(p => p.id === dragId)?.stage ?? null : null

  const patientsByStage = (stage: FlowStage) => patients.filter(p => p.stage === stage)

  if (loading) return <Spinner />

  const safeStats: QuickStats = stats ?? { totalCasesToday: 0, inOrNow: 0, pacuOccupancy: 0, pacuCapacity: 8, avgOrTime: 0 }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:5px; height:5px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:rgba(201,169,110,0.2); border-radius:3px }
        button:focus { outline:none }
        input:focus  { outline:none }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        background:'#060e1c',
        borderBottom:`1px solid ${C.goldBorder}`,
        padding:'12px 24px',
        display:'flex',
        alignItems:'center',
        justifyContent:'space-between',
        position:'sticky',
        top:0,
        zIndex:100,
      }}>
        {/* Branding */}
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Surgical cross mark */}
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect x="13" y="2" width="6" height="28" rx="2" fill={C.gold} opacity="0.9"/>
              <rect x="2" y="13" width="28" height="6" rx="2" fill={C.gold} opacity="0.9"/>
            </svg>
            <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:20, fontWeight:700, letterSpacing:'0.06em', color:C.gold }}>
              PatientTrac Surgery
            </span>
          </div>
          <div style={{ width:1, height:24, background:C.dim, opacity:0.4 }} />
          <span style={{ fontSize:11, fontFamily:'DM Mono,monospace', color:C.dim, letterSpacing:'0.1em', textTransform:'uppercase' }}>
            General Surgery EMR
          </span>
        </div>

        {/* Center — date */}
        <div style={{ fontSize:12, color:C.muted, fontFamily:'DM Mono,monospace', letterSpacing:'0.04em' }}>
          {today}
        </div>

        {/* Right — provider + actions */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:12, color:C.muted, fontFamily:'DM Mono,monospace' }}>
            {providerName}
          </div>
          <button onClick={() => setShowNewCase(true)} style={{ ...headerBtnStyle, color:C.gold, borderColor:'rgba(201,169,110,0.4)', background:'rgba(201,169,110,0.14)' }}>
            + New Case
          </button>
          {onNavigateSettings && (
            <button onClick={onNavigateSettings} style={headerBtnStyle}>
              Settings
            </button>
          )}
          {onNavigateAdmin && (
            <button onClick={onNavigateAdmin} style={{ ...headerBtnStyle, color:C.gold, borderColor:'rgba(201,169,110,0.3)' }}>
              Admin
            </button>
          )}
          {/* Live indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80', animation:'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize:10, fontFamily:'DM Mono,monospace', color:'#4ade80', letterSpacing:'0.1em' }}>LIVE</span>
          </div>
        </div>
      </header>

      {/* ── Quick Stats Row ─────────────────────────────────────────────── */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(4,1fr)',
        gap:1,
        background:C.goldBorder,
        borderBottom:`1px solid ${C.goldBorder}`,
      }}>
        {[
          { label:'Cases Today',    value: safeStats.totalCasesToday, unit:'',        color:C.gold    },
          { label:'In OR Now',      value: safeStats.inOrNow,         unit:'active',  color:C.inor    },
          { label:'PACU Occupancy', value:`${safeStats.pacuOccupancy}/${safeStats.pacuCapacity}`, unit:'beds', color:C.pacu },
          { label:'Avg OR Time',    value: fmtDuration(safeStats.avgOrTime), unit:'per case', color:C.ward },
        ].map(({ label, value, unit, color }) => (
          <div key={label} style={{ background:C.bg, padding:'16px 20px', display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ fontSize:10, fontFamily:'DM Mono,monospace', color:C.dim, letterSpacing:'0.1em', textTransform:'uppercase' }}>
              {label}
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
              <span style={{ fontSize:28, fontWeight:700, fontFamily:"'DM Sans',sans-serif", color, lineHeight:1 }}>
                {value}
              </span>
              {unit && (
                <span style={{ fontSize:11, color:C.dim, fontFamily:'DM Mono,monospace' }}>
                  {unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── View Toggle ─────────────────────────────────────────────────── */}
      <div style={{
        display:'flex',
        borderBottom:`1px solid rgba(201,169,110,0.1)`,
        background:'#060e1c',
        padding:'0 24px',
      }}>
        {([['board','Patient Flow Board'],['schedule','OR Schedule']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            style={{
              padding:'11px 20px',
              background:'transparent',
              border:'none',
              borderBottom: activeView === v ? `2px solid ${C.gold}` : '2px solid transparent',
              color: activeView === v ? C.gold : C.dim,
              cursor:'pointer',
              fontSize:11,
              fontFamily:'DM Mono,monospace',
              letterSpacing:'0.08em',
              textTransform:'uppercase',
              transition:'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ padding:24 }}>

        {activeView === 'board' && (
          <>
            {/* Patient Flow Board */}
            <SectionLabel>
              Patient Flow — {patients.length} Patients Active
              {patients.length > 0 && <span style={{ color: C.dim, textTransform: 'none', letterSpacing: 0 }}> · drag a card to change stage</span>}
            </SectionLabel>

            {patients.length === 0 && !loading && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '60px 24px', gap: 16,
                border: `1px dashed rgba(201,169,110,0.15)`, borderRadius: 8, marginBottom: 24,
              }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="4" y="8" width="40" height="32" rx="4" stroke="rgba(201,169,110,0.3)" strokeWidth="1.5"/>
                  <line x1="4" y1="16" x2="44" y2="16" stroke="rgba(201,169,110,0.2)" strokeWidth="1"/>
                  <rect x="10" y="22" width="12" height="3" rx="1" fill="rgba(201,169,110,0.25)"/>
                  <rect x="10" y="29" width="20" height="2" rx="1" fill="rgba(201,169,110,0.15)"/>
                  <rect x="10" y="33" width="14" height="2" rx="1" fill="rgba(201,169,110,0.15)"/>
                  <circle cx="38" cy="32" r="8" fill="#060e1c" stroke="rgba(201,169,110,0.4)" strokeWidth="1.5"/>
                  <line x1="38" y1="28" x2="38" y2="36" stroke="rgba(201,169,110,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="34" y1="32" x2="42" y2="32" stroke="rgba(201,169,110,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div style={{ fontSize: 14, color: C.muted, fontFamily: 'DM Mono,monospace', textAlign: 'center', lineHeight: 1.8 }}>
                  No cases scheduled for today.<br/>
                  <span style={{ fontSize: 11, color: C.dim }}>Cases booked here or on the OR board will appear in real time.</span>
                </div>
                <button onClick={() => setShowNewCase(true)} style={{ ...stageBtnPrimary, padding: '9px 18px' }}>
                  + Book a Case
                </button>
              </div>
            )}

            <div style={{
              display:'flex',
              gap:12,
              overflowX:'auto',
              paddingBottom:8,
              minHeight: patients.length > 0 ? 320 : 0,
            }}>
              {patients.length > 0 && STAGE_FLOW.map(stage => (
                <FlowLane
                  key={stage}
                  stage={stage}
                  patients={patientsByStage(stage)}
                  onClick={handlePatientClick}
                  draggingId={dragId}
                  isDropTarget={dragOverStage === stage && dragId !== null && draggingStage !== stage}
                  onCardDragStart={p => setDragId(p.id)}
                  onCardDragEnd={() => { setDragId(null); setDragOverStage(null) }}
                  onLaneDragOver={() => setDragOverStage(stage)}
                  onLaneDragLeave={() => setDragOverStage(s => (s === stage ? null : s))}
                  onLaneDrop={() => handleDropOnStage(stage)}
                />
              ))}
            </div>

            {/* Recent Completions */}
            <div style={{ marginTop:32 }}>
              <SectionLabel>Recent Completions — Last 5</SectionLabel>

              <div style={{ display:'flex', flexDirection:'column', gap:1, background:C.goldBorder }}>
                {/* Header row */}
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'1fr 1.4fr 1fr 80px 70px',
                  padding:'8px 16px',
                  background:C.card,
                  fontSize:9,
                  fontFamily:'DM Mono,monospace',
                  color:C.dim,
                  letterSpacing:'0.1em',
                  textTransform:'uppercase',
                }}>
                  <span>Patient</span>
                  <span>Procedure</span>
                  <span>Surgeon</span>
                  <span style={{ textAlign:'center' }}>Time</span>
                  <span style={{ textAlign:'center' }}>Status</span>
                </div>

                {completed.map(c => (
                  <div
                    key={c.id}
                    style={{
                      display:'grid',
                      gridTemplateColumns:'1fr 1.4fr 1fr 80px 70px',
                      padding:'12px 16px',
                      background:C.bg,
                      alignItems:'center',
                      cursor:'default',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                    onMouseLeave={e => (e.currentTarget.style.background = C.bg)}
                  >
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:C.text, fontFamily:"'DM Sans',sans-serif" }}>{c.patient}</div>
                      <div style={{ fontSize:10, color:C.dim, fontFamily:'DM Mono,monospace' }}>{c.completedAt}</div>
                    </div>
                    <div style={{ fontSize:12, color:C.muted, paddingRight:12 }}>{c.procedure}</div>
                    <div style={{ fontSize:12, color:C.muted, fontFamily:'DM Mono,monospace' }}>{c.surgeon}</div>
                    <div style={{ textAlign:'center', fontSize:12, color:C.muted, fontFamily:'DM Mono,monospace' }}>
                      {fmtDuration(c.totalTime)}
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <span style={{
                        fontSize:9, fontFamily:'DM Mono,monospace', letterSpacing:'0.08em',
                        color: outcomeColor(c.outcome),
                        background: `${outcomeColor(c.outcome)}1a`,
                        padding:'3px 8px',
                      }}>
                        {outcomeLabel(c.outcome)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeView === 'schedule' && (
          <>
            {/* OR Schedule */}
            <SectionLabel>Today's OR Schedule — {schedule.length} Cases</SectionLabel>

            <div style={{ display:'flex', flexDirection:'column', gap:1, background:C.goldBorder }}>
              {/* Header */}
              <div style={{
                display:'grid',
                gridTemplateColumns:'70px 70px 1fr 1fr 1fr 90px',
                padding:'8px 16px',
                background:C.card,
                fontSize:9,
                fontFamily:'DM Mono,monospace',
                color:C.dim,
                letterSpacing:'0.1em',
                textTransform:'uppercase',
              }}>
                <span>Time</span>
                <span>Room</span>
                <span>Procedure</span>
                <span>Patient</span>
                <span>Surgeon</span>
                <span style={{ textAlign:'center' }}>Status</span>
              </div>

              {schedule.map((c, idx) => {
                const isLive = c.status === 'in_progress'
                return (
                  <div
                    key={c.id}
                    style={{
                      display:'grid',
                      gridTemplateColumns:'70px 70px 1fr 1fr 1fr 90px',
                      padding:'14px 16px',
                      background: isLive ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? C.bg : '#070f1e',
                      alignItems:'center',
                      borderLeft: isLive ? `3px solid ${C.inor}` : '3px solid transparent',
                      transition:'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!isLive) e.currentTarget.style.background = C.card }}
                    onMouseLeave={e => { if (!isLive) e.currentTarget.style.background = idx % 2 === 0 ? C.bg : '#070f1e' }}
                  >
                    <div style={{ fontFamily:'DM Mono,monospace', fontSize:13, color:isLive ? C.inor : C.muted, fontWeight: isLive ? 700 : 400 }}>
                      {c.time}
                    </div>
                    <div style={{ fontFamily:'DM Mono,monospace', fontSize:12, color:C.muted }}>
                      {c.room}
                    </div>
                    <div>
                      <div style={{ fontSize:13, color:C.text, fontFamily:"'DM Sans',sans-serif", fontWeight:500 }}>{c.procedure}</div>
                      <div style={{ fontSize:10, color:C.dim, fontFamily:'DM Mono,monospace', marginTop:2 }}>{fmtDuration(c.duration)}</div>
                    </div>
                    <div style={{ fontSize:13, color:C.muted }}>{c.patient}</div>
                    <div style={{ fontSize:12, color:C.muted, fontFamily:'DM Mono,monospace' }}>{c.surgeon}</div>
                    <div style={{ textAlign:'center' }}>
                      <span style={{
                        fontSize:9, fontFamily:'DM Mono,monospace', letterSpacing:'0.1em',
                        color: statusColor(c.status),
                        background: `${statusColor(c.status)}1a`,
                        padding:'3px 8px',
                        display:'inline-flex',
                        alignItems:'center',
                        gap:5,
                      }}>
                        {isLive && (
                          <span style={{ width:5, height:5, borderRadius:'50%', background:C.inor, display:'inline-block', animation:'pulse 1.5s ease-in-out infinite' }} />
                        )}
                        {statusLabel(c.status)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recent completions also shown in schedule view */}
            <div style={{ marginTop:32 }}>
              <SectionLabel>Recent Completions</SectionLabel>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
                {completed.map(c => (
                  <div key={c.id} style={{
                    background:C.card,
                    border:`1px solid ${C.goldBorder}`,
                    padding:'14px 16px',
                    display:'flex',
                    flexDirection:'column',
                    gap:6,
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ fontSize:14, fontFamily:"'DM Sans',sans-serif", fontWeight:600, color:C.text }}>{c.patient}</div>
                      <span style={{
                        fontSize:9, fontFamily:'DM Mono,monospace',
                        color: outcomeColor(c.outcome),
                        background: `${outcomeColor(c.outcome)}1a`,
                        padding:'2px 7px',
                      }}>
                        {outcomeLabel(c.outcome)}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:C.muted }}>{c.procedure}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                      <span style={{ fontSize:11, color:C.dim, fontFamily:'DM Mono,monospace' }}>{c.surgeon}</span>
                      <span style={{ fontSize:11, color:C.muted, fontFamily:'DM Mono,monospace' }}>
                        {c.completedAt} · {fmtDuration(c.totalTime)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* ── Patient Drawer ───────────────────────────────────────────────── */}
      <PatientDrawer
        patient={drawerPatient}
        orgId={orgId}
        onClose={() => setDrawerPatient(null)}
        onAdvance={advanceCase}
        advancing={advancing}
      />

      {/* ── New Case modal ───────────────────────────────────────────────── */}
      {showNewCase && (
        <NewCaseModal
          defaultSurgeon={providerName}
          onSubmit={bookCase}
          onClose={() => setShowNewCase(false)}
        />
      )}
    </div>
  )
}

// ── Helper style objects used inline ──────────────────────────────────────
const headerBtnStyle: React.CSSProperties = {
  background: 'rgba(201,169,110,0.08)',
  color: '#8a9bc0',
  border: '1px solid rgba(201,169,110,0.15)',
  padding: '6px 14px',
  fontSize: 11,
  fontFamily: 'DM Mono,monospace',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const stageBtnPrimary: React.CSSProperties = {
  background: 'rgba(201,169,110,0.14)',
  color: C.gold,
  border: '1px solid rgba(201,169,110,0.4)',
  padding: '7px 16px',
  fontSize: 11,
  fontFamily: 'DM Mono,monospace',
  letterSpacing: '0.06em',
  cursor: 'pointer',
  fontWeight: 600,
}

const stageBtnGhost: React.CSSProperties = {
  background: 'transparent',
  color: C.muted,
  border: '1px solid rgba(58,74,106,0.5)',
  padding: '7px 12px',
  fontSize: 11,
  fontFamily: 'DM Mono,monospace',
  letterSpacing: '0.06em',
  cursor: 'pointer',
}

const modalInput: React.CSSProperties = {
  background: '#060e1c',
  border: '1px solid rgba(201,169,110,0.18)',
  color: '#e8eaf0',
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: "'DM Sans',sans-serif",
  width: '100%',
}
