import { useEffect, useState } from 'react'
import type { AppState } from './types'
import { DEFAULT_PREFS } from './categories'
import { migrateState } from './merge'

export const GUEST_STATE_KEY = 'paycycle.state.guest'
export const userStateKey = (userId: string) => `paycycle.state.user.${userId}`

export const emptyAppState = (): AppState => ({
  cycles: [],
  expenses: [],
  prefs: DEFAULT_PREFS,
  updatedAt: 0,
})

const LEGACY_STATE_KEYS = ['paycycle.state', 'paycycle.cycle', 'paycycle.expenses', 'paycycle.prefs', GUEST_STATE_KEY]

export function isolateUnscopedLocalState() {
  const unassigned: Record<string, string> = {}
  for (const key of LEGACY_STATE_KEYS) {
    const value = localStorage.getItem(key)
    if (value !== null) unassigned[key] = value
  }

  if (Object.keys(unassigned).length > 0) {
    const archiveKey = `paycycle.unassigned-backup.${Date.now()}`
    localStorage.setItem(archiveKey, JSON.stringify(unassigned))
  }

  for (const key of LEGACY_STATE_KEYS) localStorage.removeItem(key)
  return Object.keys(unassigned).length > 0
}

export function resolveAccountLocalState(userId: string | null, guestFallback: AppState, cachedState: AppState | null) {
  if (cachedState) return migrateState(cachedState)
  return migrateState(userId ? emptyAppState() : guestFallback)
}

export function readAppState(key: string): AppState | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const state = value as Partial<AppState>
    if (!Array.isArray(state.cycles) || !Array.isArray(state.expenses) || !state.prefs) return null
    return migrateState(state as AppState)
  } catch {
    return null
  }
}

// Stage 1 keeps data on the device. Stage 4 swaps this for Dexie + Supabase sync.
export function usePersistentState<T>(key: string, initial: T, migrate: (value: T) => T = (value) => value) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return migrate(raw ? (JSON.parse(raw) as T) : initial)
    } catch {
      return migrate(initial)
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or blocked */
    }
  }, [key, value])
  return [value, setValue] as const
}
