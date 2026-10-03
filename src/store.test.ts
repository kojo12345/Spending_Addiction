import { afterEach, describe, expect, it, vi } from 'vitest'
import { isolateUnscopedLocalState, resolveAccountLocalState, userStateKey } from './store'
import type { AppState } from './types'

const guest: AppState = {
  cycles: [{ id: 'guest-cycle', startDate: '2026-01-01', nextPayday: '2026-02-01', income: 500, fixedBills: 0, savings: 0 }],
  expenses: [],
  prefs: { categories: ['Guest category'], favorites: [], dismissed: [] },
  updatedAt: 1,
}

describe('account-scoped local state', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('starts a new account with empty data instead of guest data', () => {
    const account = resolveAccountLocalState('user-a', guest, null)
    expect(account.cycles).toEqual([])
    expect(account.expenses).toEqual([])
    expect(account.prefs.categories).not.toContain('Guest category')
  })

  it('uses only that account cache when it exists', () => {
    const accountCache: AppState = {
      cycles: [{ id: 'account-cycle', startDate: '2026-01-01', nextPayday: '2026-02-01', income: 800, fixedBills: 0, savings: 0 }],
      expenses: [],
      prefs: { categories: ['Personal'], favorites: [], dismissed: [] },
      updatedAt: 2,
    }
    const account = resolveAccountLocalState('user-a', guest, accountCache)
    expect(account.cycles.map((cycle) => cycle.id)).toEqual(['account-cycle'])
    expect(account.prefs.categories).toContain('Personal')
    expect(account.prefs.categories).not.toContain('Guest category')
  })

  it('gives different users different local cache keys', () => {
    expect(userStateKey('user-a')).not.toBe(userStateKey('user-b'))
  })

  it('keeps anonymous local data in the separate guest scope', () => {
    const guestState = resolveAccountLocalState(null, guest, null)
    expect(guestState.cycles.map((cycle) => cycle.id)).toEqual(['guest-cycle'])
    expect(guestState.prefs.categories).toContain('Guest category')
  })

  it('archives and removes unscoped state without touching account caches', () => {
    const entries = new Map<string, string>([
      ['paycycle.state', JSON.stringify(guest)],
      [userStateKey('user-a'), JSON.stringify({ cycles: [], expenses: [], prefs: guest.prefs })],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    })

    expect(isolateUnscopedLocalState()).toBe(true)
    expect(entries.has('paycycle.state')).toBe(false)
    expect(entries.has('paycycle.state.guest')).toBe(false)
    expect(entries.has(userStateKey('user-a'))).toBe(true)
    const archive = [...entries.entries()].find(([key]) => key.startsWith('paycycle.unassigned-backup.'))
    expect(archive).toBeDefined()
    expect(JSON.parse(archive![1])['paycycle.state']).toBe(JSON.stringify(guest))
  })
})
