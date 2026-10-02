import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from './categories'
import { mergeState, migrateState } from './merge'
import { cycleIncome } from './types'
import type { AppState, Cycle } from './types'

const base = (): AppState => ({ cycles: [], expenses: [], prefs: DEFAULT_PREFS, updatedAt: 10, prefsUpdatedAt: 10 })

describe('mergeState', () => {
  it('keeps independent records from both devices', () => {
    const local = { ...base(), expenses: [{ id: 'a', cycleId: 'c', amount: 3, category: 'Food', note: '', date: '2026-01-01', createdAt: 1, updatedAt: 2 }] }
    const remote = { ...base(), expenses: [{ id: 'b', cycleId: 'c', amount: 4, category: 'Food', note: '', date: '2026-01-02', createdAt: 2, updatedAt: 3 }] }
    expect(mergeState(local, remote).expenses.map((expense) => expense.id).sort()).toEqual(['a', 'b'])
  })

  it('takes the newest record and retains deletion tombstones', () => {
    const local = { ...base(), expenses: [{ id: 'a', cycleId: 'c', amount: 3, category: 'Food', note: '', date: '2026-01-01', createdAt: 1, updatedAt: 2 }] }
    const remote = { ...base(), expenses: [{ id: 'a', cycleId: 'c', amount: 3, category: 'Food', note: '', date: '2026-01-01', createdAt: 1, updatedAt: 4, deleted: true }] }
    expect(mergeState(local, remote).expenses[0]).toMatchObject({ updatedAt: 4, deleted: true })
  })

  it('merges preferences by their own last-write timestamp', () => {
    const local = { ...base(), prefs: { ...DEFAULT_PREFS, favorites: ['Food'] }, prefsUpdatedAt: 9 }
    const remote = { ...base(), prefs: { ...DEFAULT_PREFS, favorites: ['Data'] }, prefsUpdatedAt: 11 }
    expect(mergeState(local, remote).prefs.favorites).toEqual(['Data'])
  })
})

describe('migrateState', () => {
  it('adds record timestamps and preference defaults to older saved data', () => {
    const old = {
      cycles: [{ id: 'cycle', startDate: '2026-01-01', nextPayday: '2026-02-01', income: 100, fixedBills: 0, savings: 0 }],
      expenses: [{ id: 'expense', cycleId: 'cycle', amount: 10, category: 'Food', note: '', date: '2026-01-02', createdAt: 4 }],
      prefs: { categories: ['Food'], favorites: [], dismissed: [] },
      updatedAt: 5,
    } as AppState
    const migrated = migrateState(old, 20)
    expect(migrated.prefsUpdatedAt).toBe(5)
    expect(migrated.prefs.categoryLimits).toBeUndefined()
    expect(migrated.updatedAt).toBe(5)
    expect(migrated.cycles[0].updatedAt).toBe(5)
    expect(migrated.expenses[0].updatedAt).toBe(4)
    expect(migrated.cycles[0].incomeSources).toEqual([{ label: 'Income', amount: 100 }])
  })

  it('uses all income sources for cycle income while retaining legacy cycles', () => {
    const multiIncome: Cycle = {
      id: 'multi', startDate: '2026-01-01', nextPayday: '2026-02-01', income: 900,
      incomeSources: [{ label: 'Salary', amount: 700 }, { label: 'Side work', amount: 200 }],
      fixedBills: 0, savings: 0,
    }
    expect(cycleIncome(multiIncome)).toBe(900)
    expect(cycleIncome({ ...multiIncome, incomeSources: undefined })).toBe(900)
  })
})