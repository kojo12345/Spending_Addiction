import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigMessage } from './supabase'
import { toISO } from './logic'
import type { SyncStatus } from './sync'
import type { AppState } from './types'
import { configurePin, removePin, verifyPin } from './pin'
import type { Prefs } from './categories'

const LABEL: Record<SyncStatus, string> = {
  off: 'Cloud sync is not set up. Data is saved on this device only.',
  'signed-out': 'Sign in to back up and sync your data.',
  syncing: 'Syncing...',
  synced: 'All changes are saved to the cloud.',
  offline: 'Offline. Changes are kept on this device and will sync when you reconnect.',
}

export default function Account({ session, status, state, onImport, hasPin, onPinChange, onPrefs, onExportXlsx }: { session: Session | null; status: SyncStatus; state: AppState; onImport: (s: AppState) => void; hasPin: boolean; onPinChange: (enabled: boolean) => void; onPrefs: (prefs: Prefs) => void; onExportXlsx: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [msgKind, setMsgKind] = useState<'success' | 'error'>('success')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [resetPassword, setResetPassword] = useState(() => window.location.hash.includes('type=recovery'))
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setResetPassword(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const auth = async (mode: 'in' | 'up') => {
    if (!supabase) {
      setMsgKind('error')
      setMsg(supabaseConfigMessage ?? 'Cloud sign-in is unavailable.')
      return
    }
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMsgKind('error')
      setMsg('Enter a valid email address.')
      return
    }
    if (!password || (mode === 'up' && password.length < 6)) {
      setMsgKind('error')
      setMsg(mode === 'up' ? 'Choose a password with at least 6 characters.' : 'Enter your password.')
      return
    }
    setAuthBusy(true)
    setMsg('')
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error) throw error
        setMsgKind('success')
        setMsg('Signed in. Your cloud data is syncing.')
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/?auth=confirmed` },
        })
        if (error) throw error
        setMsgKind('success')
        setMsg(data.session
          ? 'Account created and signed in.'
          : 'Account created. Check your email for a confirmation link, then return here to sign in.')
      }
    } catch (error) {
      setMsgKind('error')
      setMsg(error instanceof Error ? error.message : 'Unable to complete authentication. Check your connection and try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const sendResetLink = async () => {
    if (!supabase || !email.trim()) return
    setAuthBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?auth=recovery` })
      if (error) throw error
      setMsgKind('success')
      setMsg('If an account exists for that email, a password reset link has been sent.')
    } catch (error) {
      setMsgKind('error')
      setMsg(error instanceof Error ? error.message : 'Unable to request a password reset. Check your connection and try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const signOut = async () => {
    if (!supabase) return
    setSignOutBusy(true)
    setMsg('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      setMsgKind('success')
      setMsg('You have been signed out.')
    } catch (error) {
      setMsgKind('error')
      setMsg(error instanceof Error ? error.message : 'Unable to sign out. Check your connection and try again.')
    } finally {
      setSignOutBusy(false)
    }
  }

  const saveNewPassword = async () => {
    if (!supabase) return
    if (newPassword.length < 6 || newPassword !== confirmPassword) {
      setMsgKind('error')
      setMsg('Use matching passwords of at least 6 characters.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setMsgKind(error ? 'error' : 'success')
    setMsg(error ? error.message : 'Password updated.')
    if (!error) {
      setResetPassword(false)
      setNewPassword('')
      setConfirmPassword('')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `paycycle-backup-${toISO(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    try {
      const d = JSON.parse(await file.text())
      if (!Array.isArray(d.cycles) || !Array.isArray(d.expenses) || !d.prefs) throw new Error()
      if (window.confirm('Replace the data on this device with this backup?')) onImport(d as AppState)
    } catch {
      setMsgKind('error')
      setMsg('That file is not an Xpenden Addiction backup.')
    }
  }

  const savePin = async () => {
    if (!/^\d{4,6}$/.test(newPin) || newPin !== confirmPin) {
      setMsgKind('error')
      setMsg('Use a matching PIN of 4 to 6 digits.')
      return
    }
    if (hasPin && !(await verifyPin(currentPin))) {
      setMsgKind('error')
      setMsg('Current PIN is incorrect.')
      return
    }
    await configurePin(newPin)
    onPinChange(true)
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setMsgKind('success')
    setMsg('PIN lock enabled.')
  }

  const disablePin = async () => {
    if (!(await verifyPin(currentPin))) {
      setMsgKind('error')
      setMsg('Current PIN is incorrect.')
      return
    }
    removePin()
    onPinChange(false)
    setCurrentPin('')
    setMsgKind('success')
    setMsg('PIN lock disabled.')
  }

  return (
    <main className="screen">
      <h1 className="title">{session ? 'Profile' : 'Account'}</h1>
      <section className="card stack">
        <p className="muted">{LABEL[status]}</p>
        {!supabase && <p className="bad small" role="alert">{supabaseConfigMessage}</p>}
        {supabase && resetPassword && (
          <>
            <h2 className="h2">Set a new password</h2>
            <label className="field"><span>New password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
            <label className="field"><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></label>
            <button className="primary" onClick={() => void saveNewPassword()} disabled={!newPassword || !confirmPassword}>Update password</button>
          </>
        )}
        {supabase && !resetPassword && !session && (
          <form className="stack" onSubmit={(e) => {
            e.preventDefault()
            void auth('in')
          }}>
            <label className="field"><span>Email</span><input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <label className="field"><span>Password</span><input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
            <button className="primary" type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : 'Sign in'}</button>
            <button className="link" type="button" onClick={() => void auth('up')} disabled={authBusy}>Create account</button>
            <button className="link" type="button" onClick={() => void sendResetLink()} disabled={authBusy}>Forgot password</button>
            <p className="muted small">After signup, confirm your email if prompted. The confirmation link returns to this app. Add this site’s URL to Supabase Auth → URL Configuration → Redirect URLs.</p>
          </form>
        )}
        {supabase && !resetPassword && session && (
          <div className="profile-card">
            <div className="profile-avatar" aria-hidden="true">
              {(session.user.email ?? 'U').trim().charAt(0).toUpperCase()}
            </div>
            <div className="profile-details">
              <h2 className="h2">Your profile</h2>
              <span className="muted small">Email</span>
              <strong className="profile-email">{session.user.email ?? 'Email unavailable'}</strong>
              <span className="profile-status"><span className="profile-status-dot" /> Signed in</span>
            </div>
            <button className="sign-out" type="button" onClick={() => void signOut()} disabled={signOutBusy}>
              {signOutBusy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
        {msg && <p className={`${msgKind === 'error' ? 'bad' : 'good'} small`} role={msgKind === 'error' ? 'alert' : 'status'}>{msg}</p>}
      </section>
      <section className="card stack">
        <h2 className="h2">Daily guidance</h2>
        <label className="field">
          <span>Comfortable spending buffer ({Math.round((state.prefs.comfortBuffer ?? 0.1) * 100)}%)</span>
          <input type="range" min="0" max="50" step="5" value={Math.round((state.prefs.comfortBuffer ?? 0.1) * 100)} onChange={(e) => onPrefs({ ...state.prefs, comfortBuffer: Number(e.target.value) / 100 })} />
        </label>
        <p className="muted small">Comfortable spending is the safe daily amount minus this buffer. Default: 10%.</p>
      </section>
      <section className="card stack">
        <h2 className="h2">PIN lock</h2>
        <p className="muted small">{hasPin ? 'Your app locks on open and after one minute in the background.' : 'Require a PIN when opening the app.'}</p>
        {hasPin && <label className="field"><span>Current PIN</span><input inputMode="numeric" type="password" pattern="[0-9]*" maxLength={6} value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} autoComplete="current-password" /></label>}
        <label className="field"><span>{hasPin ? 'New PIN' : 'PIN'}</span><input inputMode="numeric" type="password" pattern="[0-9]*" minLength={4} maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value)} autoComplete="new-password" /></label>
        <label className="field"><span>Confirm PIN</span><input inputMode="numeric" type="password" pattern="[0-9]*" minLength={4} maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} autoComplete="new-password" /></label>
        <button className="primary" onClick={() => void savePin()}>{hasPin ? 'Change PIN' : 'Enable PIN lock'}</button>
        {hasPin && <button className="danger-link" onClick={() => void disablePin()}>Turn off PIN lock</button>}
      </section>
      <section className="card stack">
        <h2 className="h2">Backup</h2>
        <p className="muted small">Keep a copy of your data as a file, separate from the cloud.</p>
        <button className="primary" onClick={exportJson}>Export backup</button>
        <button className="primary" onClick={onExportXlsx}>Export Excel workbook</button>
        <label className="link filebtn">Import backup<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} /></label>
      </section>
    </main>
  )
}
