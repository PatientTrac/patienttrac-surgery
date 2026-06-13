import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAppStore } from './lib/store'
import SurgeryLogin from './pages/SurgeryLogin'
import SurgeryDashboard from './pages/SurgeryDashboard'
import AdminPanel from './pages/AdminPanel'
import ConsentForm from './pages/ConsentForm'

// ── Auth guard ────────────────────────────────────────────────
interface ProtectedRouteProps {
  children: React.ReactNode
}

// Cross-app handoff: Forge/OR open this app with ?token= (single-use session
// token). Stash it pre-auth; once a session exists, resolve it to patient/
// encounter context for the modules.
function captureCrossAppToken() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (token) {
    sessionStorage.setItem('pt-surg:pending-token', token)
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.toString())
  }
}

async function resolveCrossAppToken() {
  const token = sessionStorage.getItem('pt-surg:pending-token')
  if (!token) return
  sessionStorage.removeItem('pt-surg:pending-token')
  const { data, error } = await supabase.rpc('validate_cross_app_token', { p_token: token })
  if (!error && data?.valid) {
    sessionStorage.setItem('pt-surg:encounter-context', JSON.stringify({
      org_id: data.org_id,
      patient_id: data.patient_id ?? null,
      encounter_id: data.encounter_id ?? null,
      provider_id: data.provider_id ?? null,
      source_app: data.source_app ?? null,
      patient: data.patient ?? null,
    }))
  }
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate()
  const setSession = useAppStore(s => s.setSession)
  const clearSession = useAppStore(s => s.clearSession)
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)

  const restoreSession = async (userId: string) => {
    const { data: rows } = await supabase.rpc('get_my_org_member')
    const member = rows?.[0]
    if (member?.org_id) {
      setSession({ org_id: member.org_id, provider_id: userId, access_token: undefined })
    }
    await resolveCrossAppToken()
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthed(true)
        restoreSession(session.user.id)
      } else {
        navigate('/login', { replace: true })
      }
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthed(false)
        clearSession()
        navigate('/login', { replace: true })
      } else {
        setAuthed(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#060e1c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: 'rgba(201,169,110,0.6)', fontSize: 14, fontFamily: 'sans-serif' }}>
          Loading…
        </span>
      </div>
    )
  }

  if (!authed) return null

  return <>{children}</>
}

// ── Login wrapper — redirects to /dashboard after auth ───────
function LoginRoute() {
  const navigate = useNavigate()
  const setSession = useAppStore(s => s.setSession)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard', { replace: true })
      }
      setChecking(false)
    })
  }, [navigate])

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#060e1c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: 'rgba(201,169,110,0.6)', fontSize: 14, fontFamily: 'sans-serif' }}>
          Loading…
        </span>
      </div>
    )
  }

  const handleAuthenticated = (userId: string, orgId: string, _role: string) => {
    setSession({ org_id: orgId, provider_id: userId })
    navigate('/dashboard', { replace: true })
  }

  return <SurgeryLogin onAuthenticated={handleAuthenticated} />
}

// ── App routes ────────────────────────────────────────────────
captureCrossAppToken()

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<LoginRoute />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SurgeryDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPanel />
          </ProtectedRoute>
        }
      />

      {/* Public route — no auth required */}
      <Route path="/consent/:token" element={<ConsentForm />} />
    </Routes>
  )
}
