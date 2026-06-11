import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from '../lib/store'
import { supabase } from '../lib/supabase'

const PreOpModule    = lazy(() => import('../components/surgery/PreOpModule'))
const OperativeModule = lazy(() => import('../components/surgery/OperativeModule'))
const PostOpModule   = lazy(() => import('../components/surgery/PostOpModule'))

// ── Types ──────────────────────────────────────────────────────────────────
type FlowStage = 'preop' | 'inor' | 'pacu' | 'ward' | 'discharge'
type Urgency = 'routine' | 'urgent' | 'stat'

interface PatientCard {
  id: string
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

// ── DB row shape ────────────────────────────────────────────────────────────
interface CaseRow {
  case_id: string
  procedure: string
  surgeon: string
  urgency: string
  stage: string
  stage_entered_at: string
  scheduled_time: string | null
  room: string | null
  duration_min: number
  status: string
  completed_at: string | null
  total_time_min: number | null
  outcome: string | null
  patients: { first_name: string; last_name: string; dob: string | null }
}

function minsInStage(enteredAt: string): number {
  return Math.floor((Date.now() - new Date(enteredAt).getTime()) / 60000)
}

function ageFromDob(dob: string | null): number {
  if (!dob) return 0
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
}

function rowToPatientCard(r: CaseRow): PatientCard {
  const name = `${r.patients.last_name}, ${r.patients.first_name}`
  return {
    id:           r.case_id,
    name,
    procedure:    r.procedure,
    surgeon:      r.surgeon,
    stage:        r.stage as FlowStage,
    timeInStage:  minsInStage(r.stage_entered_at),
    urgency:      r.urgency as Urgency,
    room:         r.room ?? undefined,
    age:          ageFromDob(r.patients.dob),
  }
}

function rowToScheduled(r: CaseRow): ScheduledCase {
  const name = `${r.patients.last_name}, ${r.patients.first_name}`
  return {
    id:        r.case_id,
    time:      r.scheduled_time?.slice(0, 5) ?? '—',
    room:      r.room ?? '—',
    procedure: r.procedure,
    patient:   name,
    surgeon:   r.surgeon,
    duration:  r.duration_min,
    status:    r.status as ScheduledCase['status'],
  }
}

function rowToCompleted(r: CaseRow): CompletedCase {
  const name = `${r.patients.last_name}, ${r.patients.first_name}`
  return {
    id:          r.case_id,
    patient:     name,
    procedure:   r.procedure,
    surgeon:     r.surgeon,
    completedAt: r.completed_at
      ? new Date(r.completed_at).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false })
      : '—',
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
function PatientDrawer({ patient, orgId, onClose }: {
  patient: PatientCard | null
  orgId: string
  onClose: () => void
}) {
  if (!patient) return null

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
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: 'Rajdhani,sans-serif' }}>
              {patient.name}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono,monospace', marginTop: 2 }}>
              {patient.procedure} · {patient.surgeon} · {stageLabel(patient.stage).toUpperCase()}
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

        {/* Module content */}
        <div style={{ flex: 1, padding: 24 }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${C.dim}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          }>
            {moduleForStage(patient.stage)}
          </Suspense>
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

function PatientFlowCard({ patient, onClick }: { patient: PatientCard; onClick: () => void }) {
  const accent = stageAccent(patient.stage)
  return (
    <div
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${C.goldBorder}`,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
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

      <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.02em', paddingRight: patient.urgency !== 'routine' ? 50 : 0 }}>
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

function FlowLane({ stage, patients, onClick }: { stage: FlowStage; patients: PatientCard[]; onClick: (p: PatientCard) => void }) {
  const accent = stageAccent(stage)
  return (
    <div style={{ flex:1, minWidth:160, display:'flex', flexDirection:'column' }}>
      {/* Lane header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 12px',
        background: accent.bg,
        borderTop: `2px solid ${accent.color}`,
        marginBottom:8,
      }}>
        <div style={{ fontSize:11, fontFamily:'DM Mono,monospace', color:accent.color, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:600 }}>
          {stageLabel(stage)}
        </div>
        <div style={{ fontSize:12, fontFamily:'DM Mono,monospace', color:accent.color, background:`rgba(0,0,0,0.3)`, padding:'1px 8px', borderRadius:2 }}>
          {patients.length}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1 }}>
        {patients.length === 0 ? (
          <div style={{ padding:'20px 12px', textAlign:'center', color:C.dim, fontSize:11, fontFamily:'DM Mono,monospace', border:`1px dashed rgba(58,74,106,0.3)` }}>
            EMPTY
          </div>
        ) : (
          patients.map(p => (
            <PatientFlowCard key={p.id} patient={p} onClick={() => onClick(p)} />
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

      const { data, error } = await (supabase as any)
        .schema('cr')
        .from('surgical_cases')
        .select(`
          case_id, procedure, surgeon, urgency, stage, stage_entered_at,
          scheduled_time, room, duration_min, status,
          completed_at, total_time_min, outcome,
          patients ( first_name, last_name, dob )
        `)
        .eq('org_id', currentOrgId)
        .eq('case_date', todayStr)
        .neq('stage', 'cancelled')
        .order('scheduled_time', { ascending: true })

      if (error) throw error

      const rows: CaseRow[] = data ?? []
      const active   = rows.filter(r => r.stage !== 'discharge' && r.status !== 'completed')
      const board    = rows.filter(r => !['cancelled'].includes(r.stage))
      const done     = rows.filter(r => r.status === 'completed').slice(-5).reverse()
      const sched    = rows.filter(r => !['cancelled'].includes(r.status))

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

  // Realtime: re-fetch whenever any surgical_case changes for this org
  useEffect(() => {
    if (!orgId) return
    const channel = supabase
      .channel(`surgical_cases:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'cr', table: 'surgical_cases' },
        () => { loadData(orgId) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId, loadData])

  const handlePatientClick = (p: PatientCard) => {
    setDrawerPatient(p)
  }

  const stageOrder: FlowStage[] = ['preop', 'inor', 'pacu', 'ward', 'discharge']
  const patientsByStage = (stage: FlowStage) => patients.filter(p => p.stage === stage)

  if (loading) return <Spinner />

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
            <span style={{ fontFamily:'Rajdhani,sans-serif', fontSize:20, fontWeight:700, letterSpacing:'0.06em', color:C.gold }}>
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
          { label:'Cases Today',    value: stats!.totalCasesToday, unit:'',        color:C.gold    },
          { label:'In OR Now',      value: stats!.inOrNow,         unit:'active',  color:C.inor    },
          { label:'PACU Occupancy', value:`${stats!.pacuOccupancy}/${stats!.pacuCapacity}`, unit:'beds', color:C.pacu },
          { label:'Avg OR Time',    value: fmtDuration(stats!.avgOrTime), unit:'per case', color:C.ward },
        ].map(({ label, value, unit, color }) => (
          <div key={label} style={{ background:C.bg, padding:'16px 20px', display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ fontSize:10, fontFamily:'DM Mono,monospace', color:C.dim, letterSpacing:'0.1em', textTransform:'uppercase' }}>
              {label}
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
              <span style={{ fontSize:28, fontWeight:700, fontFamily:'Rajdhani,sans-serif', color, lineHeight:1 }}>
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
            <SectionLabel>Patient Flow — {patients.length} Patients Active</SectionLabel>

            <div style={{
              display:'flex',
              gap:12,
              overflowX:'auto',
              paddingBottom:8,
              minHeight:320,
            }}>
              {stageOrder.map(stage => (
                <FlowLane
                  key={stage}
                  stage={stage}
                  patients={patientsByStage(stage)}
                  onClick={handlePatientClick}
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
                      <div style={{ fontSize:13, fontWeight:500, color:C.text, fontFamily:'Rajdhani,sans-serif' }}>{c.patient}</div>
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
                      <div style={{ fontSize:13, color:C.text, fontFamily:'Rajdhani,sans-serif', fontWeight:500 }}>{c.procedure}</div>
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
                      <div style={{ fontSize:14, fontFamily:'Rajdhani,sans-serif', fontWeight:600, color:C.text }}>{c.patient}</div>
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
      />
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
