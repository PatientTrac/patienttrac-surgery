import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const MFA_REQUIRED_ROLES = ['super_admin', 'admin', 'provider']
type Step = 'credentials' | 'mfa_challenge' | 'mfa_setup'

interface Props {
  onAuthenticated: (userId: string, orgId: string, role: string) => void
}

export default function SurgeryLogin({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [mfaSecret, setMfaSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const challengeInputRef = useRef<HTMLInputElement>(null)
  const setupInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'mfa_challenge') setTimeout(() => challengeInputRef.current?.focus(), 100)
    if (step === 'mfa_setup') setTimeout(() => setupInputRef.current?.focus(), 100)
  }, [step])

  const handleCredentials = async () => {
    setError('')
    if (!email || !password) { setError('Email and password required'); return }
    setLoading(true)
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) throw new Error(authErr.message)
      const token = authData.session?.access_token
      if (!token) throw new Error('No session token')
      setSessionToken(token)
      const { data: memberRows, error: memberErr } = await supabase
        .rpc('get_my_org_member')
      const member = memberRows?.[0]
      if (memberErr || !member) throw new Error('Account not found. Contact your administrator.')
      if (!member.is_active) throw new Error('Account not yet active. Check your email for an invitation.')
      if (!['provider', 'admin', 'super_admin'].includes(member.role)) throw new Error('Provider account required to access PatientTrac Surgery.')
      if (MFA_REQUIRED_ROLES.includes(member.role)) {
        if (member.mfa_enabled && member.mfa_secret && member.mfa_verified_at) {
          setStep('mfa_challenge')
        } else {
          await initMfaSetup(token)
          setStep('mfa_setup')
        }
      } else {
        sessionStorage.setItem('pts_mfa_verified', '1')
        onAuthenticated(authData.user.id, member.org_id, member.role)
      }
    } catch (e: any) { setError(e.message); await supabase.auth.signOut() }
    finally { setLoading(false) }
  }

  const initMfaSetup = async (token: string) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/totp-setup?action=setup`,
      { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setQrUrl(data.qr_url); setMfaSecret(data.secret)
  }

  const handleMfaChallenge = async () => {
    setError('')
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from Google Authenticator'); return }
    setLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/totp-setup`,
        { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'challenge', token: totpCode, app_source: 'surgery' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invalid code')
      sessionStorage.setItem('pts_mfa_verified', '1')
      const { data: { user } } = await supabase.auth.getUser()
      const { data: memberRows } = await supabase.rpc('get_my_org_member')
      const member = memberRows?.[0]
      onAuthenticated(user!.id, member!.org_id, member!.role)
    } catch (e: any) { setError(e.message); setTotpCode('') }
    finally { setLoading(false) }
  }

  const handleMfaVerify = async () => {
    setError('')
    if (setupCode.length !== 6) { setError('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/totp-setup`,
        { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', token: setupCode, app_source: 'surgery' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invalid code')
      sessionStorage.setItem('pts_mfa_verified', '1')
      const { data: { user } } = await supabase.auth.getUser()
      const { data: memberRows } = await supabase.rpc('get_my_org_member')
      const member = memberRows?.[0]
      onAuthenticated(user!.id, member!.org_id, member!.role)
    } catch (e: any) { setError(e.message); setSetupCode('') }
    finally { setLoading(false) }
  }

  const handleTotpInput = (val: string, setter: (v: string) => void) => setter(val.replace(/\D/g, '').slice(0, 6))

  // Accent color: clinical blue-green #00d4ff (replaces Revela gold #c9a96e)
  const A = '#00d4ff'
  const Adim = 'rgba(0,212,255,0.7)'
  const Afaint = 'rgba(0,212,255,0.3)'
  const Aborder = 'rgba(0,212,255,0.2)'
  const Abg = 'rgba(0,212,255,0.08)'
  const AborderActive = 'rgba(0,212,255,0.5)'
  const AbgActive = 'rgba(0,212,255,0.15)'

  const S = {
    page: { minHeight: '100vh', background: '#060e1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' } as React.CSSProperties,
    card: { width: 420, background: '#0a1628', border: `1px solid ${Aborder}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } as React.CSSProperties,
    hdr: { background: '#060e1c', padding: '28px 32px', textAlign: 'center' as const, borderBottom: `1px solid rgba(0,212,255,0.12)` },
    body: { padding: '28px 32px' } as React.CSSProperties,
    lbl: { display: 'block', fontSize: 10, color: Adim, letterSpacing: '1.2px', textTransform: 'uppercase' as const, marginBottom: 6 },
    inp: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 16 },
    btn: (on = true) => ({ width: '100%', padding: '13px', background: on ? A : 'rgba(0,212,255,0.15)', border: 'none', borderRadius: 8, color: on ? '#060e1c' : 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 700, cursor: on ? 'pointer' : 'not-allowed', marginTop: 8 } as React.CSSProperties),
    err: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 } as React.CSSProperties,
    back: { width: '100%', padding: '10px', marginTop: 10, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
    digit: (f = false) => ({ width: '100%', textAlign: 'center' as const, fontSize: 22, fontWeight: 700, padding: '12px 0', background: f ? AbgActive : 'rgba(255,255,255,0.05)', border: `1px solid ${f ? AborderActive : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, color: A, fontFamily: 'monospace' } as React.CSSProperties),
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.hdr}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {/* Cross / surgical mark in clinical blue-green */}
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="13" y="2" width="6" height="28" rx="2" fill={A} opacity="0.9"/>
              <rect x="2" y="13" width="28" height="6" rx="2" fill={A} opacity="0.9"/>
              <rect x="13" y="2" width="6" height="28" rx="2" fill="none" stroke={A} strokeWidth="0.5"/>
              <rect x="2" y="13" width="28" height="6" rx="2" fill="none" stroke={A} strokeWidth="0.5"/>
            </svg>
            <span style={{ color: A, fontSize: 20, fontWeight: 600 }}>PatientTrac Surgery</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {step === 'credentials' ? 'General Surgery EMR' : step === 'mfa_challenge' ? 'Two-Factor Authentication' : 'Set Up Google Authenticator'}
          </div>
        </div>
        <div style={S.body}>
          {step === 'credentials' && (<>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.6 }}>Clinical documentation · Surgical notes · HIPAA Compliant</p>
            <label style={S.lbl}>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCredentials()} placeholder="surgeon@practice.com" style={S.inp}/>
            <label style={S.lbl}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCredentials()} placeholder="••••••••••••" style={S.inp}/>
            {error && <div style={S.err}>{error}</div>}
            <button onClick={handleCredentials} disabled={loading} style={S.btn()}>{loading ? 'Signing in…' : 'Sign in securely →'}</button>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>256-bit TLS · HIPAA compliant · Google Authenticator MFA</span>
            </div>
          </>)}
          {step === 'mfa_challenge' && (<>
            <div style={{ background: Abg, border: `1px solid ${Aborder}`, borderRadius: 10, padding: '14px 16px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: A, marginBottom: 4 }}>Google Authenticator — 6-digit code</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>Open Google Authenticator and enter the code for PatientTrac Surgery.</div>
            </div>
            <label style={S.lbl}>Authenticator Code</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }} onClick={() => challengeInputRef.current?.focus()}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} style={S.digit(!!totpCode[i])}>{totpCode[i] ?? ''}</div>)}
            </div>
            <input ref={challengeInputRef} autoFocus value={totpCode} onChange={e => handleTotpInput(e.target.value, setTotpCode)} onKeyDown={e => e.key === 'Enter' && totpCode.length === 6 && handleMfaChallenge()} style={{ position: 'fixed', opacity: 0, width: 1, height: 1, top: 0, left: 0 }}/>
            {error && <div style={S.err}>{error}</div>}
            <button onClick={handleMfaChallenge} disabled={loading || totpCode.length !== 6} style={S.btn(totpCode.length === 6)}>{loading ? 'Verifying…' : 'Verify & Sign In →'}</button>
            <button onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); supabase.auth.signOut() }} style={S.back}>← Back</button>
          </>)}
          {step === 'mfa_setup' && (<>
            <div style={{ background: Abg, border: `1px solid ${Aborder}`, borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: A, marginBottom: 4 }}>Set up Google Authenticator</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>Required for your role. One-time setup on your own phone.</div>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>1. Install Google Authenticator · 2. Tap + → Scan QR code</div>
              {qrUrl && <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 8 }}><img src={qrUrl} alt="QR Code" width={160} height={160}/></div>}
            </div>
            {mfaSecret && <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>Manual entry key</div>
              <code style={{ fontSize: 13, color: A, letterSpacing: '2px' }}>{mfaSecret}</code>
            </div>}
            <label style={S.lbl}>3. Enter the 6-digit code to confirm</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }} onClick={() => setupInputRef.current?.focus()}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} style={S.digit(!!setupCode[i])}>{setupCode[i] ?? ''}</div>)}
            </div>
            <input ref={setupInputRef} autoFocus value={setupCode} onChange={e => handleTotpInput(e.target.value, setSetupCode)} onKeyDown={e => e.key === 'Enter' && setupCode.length === 6 && handleMfaVerify()} style={{ position: 'fixed', opacity: 0, width: 1, height: 1, top: 0, left: 0 }}/>
            {error && <div style={S.err}>{error}</div>}
            <button onClick={handleMfaVerify} disabled={loading || setupCode.length !== 6} style={S.btn(setupCode.length === 6)}>{loading ? 'Activating…' : 'Activate MFA & Sign In →'}</button>
            <button onClick={() => { setStep('credentials'); setSetupCode(''); setError(''); supabase.auth.signOut() }} style={S.back}>← Back</button>
          </>)}
        </div>
      </div>
    </div>
  )
}
