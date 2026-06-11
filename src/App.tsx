import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import SurgeryLogin from './pages/SurgeryLogin'
import SurgeryDashboard from './pages/SurgeryDashboard'
import AdminPanel from './pages/AdminPanel'
import ConsentForm from './pages/ConsentForm'

// ── Auth guard ────────────────────────────────────────────────
interface ProtectedRouteProps {
  children: React.ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthed(true)
      } else {
        navigate('/login', { replace: true })
      }
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthed(false)
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

  const handleAuthenticated = (_userId: string, _orgId: string, _role: string) => {
    navigate('/dashboard', { replace: true })
  }

  return <SurgeryLogin onAuthenticated={handleAuthenticated} />
}

// ── App routes ────────────────────────────────────────────────
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
