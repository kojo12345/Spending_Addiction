import { DEFAULT_PREFS } from './categories'
import type { AppState, Cycle, Expense } from './types'

export function migrateState(value: AppState, now = Date.now()): AppState {
  const updatedAt = Number.isFinite(value.updatedAt) ? value.updatedAt : now
  const prefsUpdatedAt = value.prefsUpdatedAt ?? updatedAt
  return {
    ...value,
    cycles: (Array.isArray(value.cycles) ? value.cycles : []).map((cycle) => ({
      ...cycle,
      incomeSources: cycle.incomeSources?.length ? cycle.incomeSources : [{ label: 'Income', amount: cycle.income }],
      updatedAt: cycle.updatedAt ?? updatedAt,
    })),
    expenses: (Array.isArray(value.expenses) ? value.expenses : []).map((expense) => ({
      ...expense,
      updatedAt: expense.updatedAt ?? expense.createdAt ?? updatedAt,
    })),
    prefs: { ...DEFAULT_PREFS, ...value.prefs },
    updatedAt,
    prefsUpdatedAt,
  }
}

function mergeRecords<T extends Cycle | Expense>(local: T[], remote: T[]): T[] {
  const records = new Map(local.map((record) => [record.id, record]))
  for (const record of remote) {
    const existing = records.get(record.id)
    if (!existing || (record.updatedAt ?? 0) > (existing.updatedAt ?? 0)) records.set(record.id, record)
  }
  return [...records.values()]
}

export function mergeState(local: AppState, remote: AppState): AppState {
  const localPrefsAt = local.prefsUpdatedAt ?? local.updatedAt
  const remotePrefsAt = remote.prefsUpdatedAt ?? remote.updatedAt
  return {
    ...local,
    cycles: mergeRecords(local.cycles, remote.cycles),
    expenses: mergeRecords(local.expenses, remote.expenses),
    prefs: remotePrefsAt > localPrefsAt ? remote.prefs : local.prefs,
    prefsUpdatedAt: Math.max(localPrefsAt, remotePrefsAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}