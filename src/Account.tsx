import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
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

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setResetPassword(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const auth = async (mode: 'in' | 'up') => {
    if (!supabase) return
    const creds = { email, password }
    const { error } = mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds)
    setMsgKind(error ? 'error' : 'success')
    setMsg(error ? error.message : mode === 'up' ? 'Account created. If email confirmation is on, confirm it, then sign in.' : '')
  }

  const sendResetLink = async () => {
    if (!supabase || !email) return
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setMsgKind(error ? 'error' : 'success')
    setMsg(error ? error.message : 'Password reset link sent. Check your email.')
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
      setMsg('That file is not a Paycycle backup.')
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
      <h1 className="title">Account</h1>
      <section className="card stack">
        <p className="muted">{LABEL[status]}</p>
        {supabase && resetPassword && (
          <>
            <h2 className="h2">Set a new password</h2>
            <label className="field"><span>New password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
            <label className="field"><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></label>
            <button className="primary" onClick={() => void saveNewPassword()} disabled={!newPassword || !confirmPassword}>Update password</button>
          </>
        )}
        {supabase && !resetPassword && !session && (
          <>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button className="primary" onClick={() => auth('in')} disabled={!email || !password}>Sign in</button>
            <button className="link" onClick={() => auth('up')} disabled={!email || password.length < 6}>Create account</button>
            <button className="link" onClick={() => void sendResetLink()} disabled={!email}>Forgot password</button>
          </>
        )}
        {supabase && !resetPassword && session && (
          <>
            <p><strong>{session.user.email}</strong></p>
            <button className="link" onClick={() => supabase!.auth.signOut()}>Sign out</button>
          </>
        )}
        {msg && <p className={`${msgKind === 'error' ? 'bad' : 'good'} small`} role="status">{msg}</p>}
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
