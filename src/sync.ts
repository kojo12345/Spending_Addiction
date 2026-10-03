import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppState } from './types'
import { mergeState, migrateState } from './merge'
import { emptyAppState, GUEST_STATE_KEY, isolateUnscopedLocalState, readAppState, resolveAccountLocalState, userStateKey } from './store'

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline'

function stateForAccount(userId: string | null, guestFallback: AppState) {
  const key = userId ? userStateKey(userId) : GUEST_STATE_KEY
  return resolveAccountLocalState(userId, guestFallback, readAppState(key))
}

/** Load and cache each account independently; guest data is never merged into an account. */
export function useSync(state: AppState, setState: (s: AppState) => void, guestFallback: AppState) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [loadedOwnerId, setLoadedOwnerId] = useState<string | null | undefined>(undefined)
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signed-out' : 'off')
  const [syncMessage, setSyncMessage] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const latest = useRef(state)
  latest.current = state
  const latestSession = useRef(session)
  latestSession.current = session
  const pulledFor = useRef<string | null | undefined>(undefined)
  const pushed = useRef('')
  const initialGuestState = useRef(guestFallback)

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }

    let authEventReceived = false
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true
      if (_event === 'SIGNED_OUT' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistration('/reminder/').then(async (registration) => {
          if (!registration) return
          registration.active?.postMessage({ type: 'SET_DAILY_REMINDER', reminder: { enabled: false } })
          const periodic = registration as ServiceWorkerRegistration & { periodicSync?: { unregister?: (tag: string) => Promise<void> } }
          await periodic.periodicSync?.unregister?.('paycycle-daily-reminder')
        }).catch((error: unknown) => {
          setSyncMessage(error instanceof Error
            ? `Signed out, but could not disable the old account's notification: ${error.message}`
            : 'Signed out, but could not disable the old account’s notification.')
        })
      }
      setSession(nextSession)
      setAuthReady(true)
    })

    void supabase.auth.getSession().then(({ data: result, error }) => {
      if (error) {
        setSyncMessage(`Unable to restore sign-in: ${error.message}`)
        setStatus('offline')
      }
      if (!authEventReceived) setSession(result.session)
      setAuthReady(true)
    }).catch((error: unknown) => {
      setSyncMessage(error instanceof Error ? `Unable to restore sign-in: ${error.message}` : 'Unable to restore your sign-in.')
      setStatus('offline')
      setAuthReady(true)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const push = async () => {
    const activeSession = latestSession.current
    if (!supabase || !activeSession || pulledFor.current !== activeSession.user.id) return
    const snapshot = latest.current
    const fingerprint = JSON.stringify(snapshot)
    if (fingerprint === pushed.current) return
    setStatus('syncing')
    setSyncMessage('')
    const { error } = await supabase
      .from('app_state')
      .upsert({ user_id: activeSession.user.id, data: snapshot, updated_at: new Date().toISOString() })
    if (latestSession.current?.user.id !== activeSession.user.id) return
    if (error) {
      setStatus('offline')
      setSyncMessage(`Cloud sync failed: ${error.message}`)
      return
    }
    pushed.current = fingerprint
    setStatus('synced')
  }

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    const ownerId = session?.user.id ?? null
    setSyncMessage('')
    if (ownerId) {
      try {
        const archivedUnassignedData = isolateUnscopedLocalState()
        initialGuestState.current = emptyAppState()
        if (archivedUnassignedData) setSyncMessage('Older device-only data was kept separate and was not added to this account.')
      } catch (error) {
        setSyncMessage(error instanceof Error
          ? `Could not isolate older device-only data. Your account data will still load separately: ${error.message}`
          : 'Could not isolate older device-only data. Your account data will still load separately.')
        initialGuestState.current = emptyAppState()
      }
    }
    const localState = stateForAccount(ownerId, initialGuestState.current)
    pulledFor.current = undefined
    pushed.current = ''
    setLoadedOwnerId(undefined)
    setStatus(supabase ? session ? 'syncing' : 'signed-out' : 'off')

    const load = async () => {
      if (!supabase || !session) {
        if (cancelled) return
        latest.current = localState
        setState(localState)
        setLoadedOwnerId(null)
        return
      }

      const { data, error } = await supabase
        .from('app_state')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        latest.current = localState
        setState(localState)
        setLoadedOwnerId(ownerId)
        setStatus('offline')
        setSyncMessage(`Could not load this account's cloud data: ${error.message}. Changes are only saved on this device until sync works.`)
        return
      }

      const remote = data?.data as AppState | undefined
      const accountState = remote ? mergeState(localState, migrateState(remote)) : localState
      latest.current = accountState
      setState(accountState)
      pulledFor.current = ownerId
      setLoadedOwnerId(ownerId)
      setStatus('synced')
      if (remote && JSON.stringify(accountState) === JSON.stringify(migrateState(remote))) {
        pushed.current = JSON.stringify(accountState)
      }
    }

    void load().catch((error: unknown) => {
      if (cancelled) return
      latest.current = localState
      setState(localState)
      setLoadedOwnerId(ownerId)
      setStatus('offline')
      setSyncMessage(error instanceof Error ? `Could not load this account's cloud data: ${error.message}` : 'Could not load this account’s cloud data.')
    })
    return () => {
      cancelled = true
    }
  }, [authReady, session, retryCount])

  useEffect(() => {
    if (loadedOwnerId === undefined || loadedOwnerId !== (session?.user.id ?? null)) return
    const key = session ? userStateKey(session.user.id) : GUEST_STATE_KEY
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      setSyncMessage(error instanceof Error ? `Could not save the local account cache: ${error.message}` : 'Could not save the local account cache.')
    }
  }, [state, session, loadedOwnerId])

  useEffect(() => {
    const ownerId = session?.user.id ?? null
    if (!authReady || loadedOwnerId !== ownerId || !session || pulledFor.current !== ownerId) return
    const timeout = window.setTimeout(() => void push(), 1200)
    return () => window.clearTimeout(timeout)
  }, [state, session, authReady, loadedOwnerId])

  useEffect(() => {
    if (!supabase) return
    const on = () => setRetryCount((count) => count + 1)
    const off = () => {
      setStatus('offline')
      setSyncMessage('Offline. Changes are saved to this account on this device.')
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return { session, status, authReady, loadedOwnerId, syncMessage }
}
