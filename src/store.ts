import { useEffect, useState } from 'react'

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
