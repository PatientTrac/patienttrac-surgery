import { useState, useEffect, useCallback } from 'react'

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

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_PATIENTS: PatientCard[] = [
  { id:'pt-001', name:'Harrington, Dale',  procedure:'Laparoscopic Cholecystectomy', surgeon:'Dr. Okafor',  stage:'preop',    timeInStage:22,  urgency:'routine', age:58 },
  { id:'pt-002', name:'Vance, Simone',     procedure:'Appendectomy',                surgeon:'Dr. Reyes',   stage:'preop',    timeInStage:8,   urgency:'urgent',  age:34 },
  { id:'pt-003', name:'Fontaine, Marcus',  procedure:'Inguinal Hernia Repair',      surgeon:'Dr. Okafor',  stage:'inor',     timeInStage:67,  urgency:'routine', room:'OR-1', age:47 },
  { id:'pt-004', name:'Deschamps, Lydia',  procedure:'Sigmoid Colectomy',           surgeon:'Dr. Patel',   stage:'inor',     timeInStage:142, urgency:'routine', room:'OR-2', age:64 },
  { id:'pt-005', name:'Tran, Benjamin',    procedure:'Exploratory Laparotomy',      surgeon:'Dr. Reyes',   stage:'inor',     timeInStage:38,  urgency:'stat',    room:'OR-3', age:29 },
  { id:'pt-006', name:'Osei, Catherine',   procedure:'Lap Cholecystectomy',         surgeon:'Dr. Patel',   stage:'pacu',     timeInStage:55,  urgency:'routine', age:51 },
  { id:'pt-007', name:'Kowalski, Leon',    procedure:'Right Hemicolectomy',         surgeon:'Dr. Okafor',  stage:'pacu',     timeInStage:28,  urgency:'routine', age:72 },
  { id:'pt-008', name:'Abreu, Marisol',    procedure:'Gastric Bypass',              surgeon:'Dr. Patel',   stage:'ward',     timeInStage:310, urgency:'routine', age:44 },
  { id:'pt-009', name:'Donnelly, Patrick', procedure:'Small Bowel Resection',       surgeon:'Dr. Reyes',   stage:'ward',     timeInStage:820, urgency:'routine', age:66 },
  { id:'pt-010', name:'Stern, Rachel',     procedure:'Inguinal Hernia Repair',      surgeon:'Dr. Okafor',  stage:'discharge',timeInStage:95,  urgency:'routine', age:39 },
]

const MOCK_SCHEDULE: ScheduledCase[] = [
  { id:'case-01', time:'07:30', room:'OR-1', procedure:'Inguinal Hernia Repair',      patient:'Fontaine, Marcus',  surgeon:'Dr. Okafor', duration:90,  status:'in_progress' },
  { id:'case-02', time:'08:00', room:'OR-2', procedure:'Sigmoid Colectomy',           patient:'Deschamps, Lydia',  surgeon:'Dr. Patel',  duration:180, status:'in_progress' },
  { id:'case-03', time:'08:30', room:'OR-3', procedure:'Exploratory Laparotomy',      patient:'Tran, Benjamin',    surgeon:'Dr. Reyes',  duration:120, status:'in_progress' },
  { id:'case-04', time:'11:30', room:'OR-1', procedure:'Laparoscopic Cholecystectomy',patient:'Harrington, Dale',  surgeon:'Dr. Okafor', duration:75,  status:'scheduled'   },
  { id:'case-05', time:'13:00', room:'OR-2', procedure:'Appendectomy',                patient:'Vance, Simone',     surgeon:'Dr. Reyes',  duration:60,  status:'delayed'     },
  { id:'case-06', time:'14:30', room:'OR-3', procedure:'Thyroidectomy',               patient:'Nguyen, Patricia',  surgeon:'Dr. Patel',  duration:120, status:'scheduled'   },
  { id:'case-07', time:'15:00', room:'OR-1', procedure:'Ventral Hernia Repair',       patient:'Gomez, Eduardo',    surgeon:'Dr. Okafor', duration:90,  status:'scheduled'   },
]

const MOCK_COMPLETED: CompletedCase[] = [
  { id:'done-01', patient:'Stern, Rachel',     procedure:'Inguinal Hernia Repair',    surgeon:'Dr. Okafor', completedAt:'06:15', totalTime:88,  outcome:'routine'             },
  { id:'done-02', patient:'Osei, Catherine',   procedure:'Lap Cholecystectomy',       surgeon:'Dr. Patel',  completedAt:'06:45', totalTime:72,  outcome:'routine'             },
  { id:'done-03', patient:'Yamamoto, Kenji',   procedure:'Appendectomy',              surgeon:'Dr. Reyes',  completedAt:'05:30', totalTime:58,  outcome:'complication_noted'  },
  { id:'done-04', patient:'Abreu, Marisol',    procedure:'Gastric Bypass',            surgeon:'Dr. Patel',  completedAt:'04:00', totalTime:214, outcome:'extended'            },
  { id:'done-05', patient:'Donnelly, Patrick', procedure:'Small Bowel Resection',     surgeon:'Dr. Reyes',  completedAt:'03:20', totalTime:168, outcome:'routine'             },
]

const MOCK_STATS: QuickStats = {
  totalCasesToday: 12,
  inOrNow: 3,
  pacuOccupancy: 2,
  pacuCapacity: 8,
  avgOrTime: 104,
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

export default function SurgeryDashboard({ orgId = '', providerName = 'Dr. Okafor', onNavigateAdmin, onNavigateSettings }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [patients,   setPatients]   = useState<PatientCard[]>([])
  const [schedule,   setSchedule]   = useState<ScheduledCase[]>([])
  const [completed,  setCompleted]  = useState<CompletedCase[]>([])
  const [stats,      setStats]      = useState<QuickStats | null>(null)
  const [toast,      setToast]      = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'board' | 'schedule'>('board')

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  // Simulate data fetch
  const loadData = useCallback(async (_orgId: string) => {
    setLoading(true)
    // In a real sprint this calls Supabase — for now mock delay
    await new Promise(r => setTimeout(r, 600))
    setPatients(MOCK_PATIENTS)
    setSchedule(MOCK_SCHEDULE)
    setCompleted(MOCK_COMPLETED)
    setStats(MOCK_STATS)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (orgId) loadData(orgId)
  }, [orgId, loadData])

  const handlePatientClick = (p: PatientCard) => {
    setToast(`Patient chart for ${p.name} — coming soon`)
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
