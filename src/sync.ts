import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppState } from './types'
import { mergeState, migrateState } from './merge'

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline'

/** Merge each record by its own timestamp; deleted records remain as sync tombstones. */
export function useSync(state: AppState, setState: (s: AppState) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signed-out' : 'off')
  const latest = useRef(state)
  latest.current = state
  const pulled = useRef(false)
  const pushed = useRef('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const push = async () => {
    if (!supabase || !session || !pulled.current) return
    const s = latest.current
    const fingerprint = JSON.stringify(s)
    if (fingerprint === pushed.current) return
    setStatus('syncing')
    const { error } = await supabase
      .from('app_state')
      .upsert({ user_id: session.user.id, data: s, updated_at: new Date().toISOString() })
    if (error) return setStatus('offline')
    pushed.current = fingerprint
    setStatus('synced')
  }

  useEffect(() => {
    pulled.current = false
    if (!supabase || !session) return setStatus(supabase ? 'signed-out' : 'off')
    setStatus('syncing')
    supabase
      .from('app_state')
      .select('data')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setStatus('offline')
        const remote = data?.data as AppState | undefined
        const localState = migrateState(latest.current)
        const merged = remote ? mergeState(localState, migrateState(remote)) : localState
        latest.current = merged
        setState(merged)
        pulled.current = true
        setStatus('synced')
        if (remote && JSON.stringify(merged) === JSON.stringify(migrateState(remote))) pushed.current = JSON.stringify(merged)
        void push()
      })
  }, [session])

  useEffect(() => {
    const t = setTimeout(() => void push(), 1500)
    return () => clearTimeout(t)
  }, [state, session])

  useEffect(() => {
    if (!supabase) return
    const on = () => void push()
    const off = () => setStatus('offline')
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [session])

  return { session, status }
}
