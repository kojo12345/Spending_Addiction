import type { Expense } from './types'
import { daysBetween } from './logic'

export interface Prefs {
  categories: string[]
  favorites: string[]
  dismissed: string[] // categories whose favorite suggestion was declined
  categoryLimits?: Record<string, number>
  recurringItems?: RecurringItem[]
  comfortBuffer?: number
  dayWeights?: Record<string, number>
  plannedExpenses?: PlannedExpense[]
  savingsGoals?: SavingsGoal[]
  morningReminder?: { enabled: boolean; time: string }
}

export interface PlannedExpense {
  id: string
  cycleId: string
  name: string
  amount: number
  date: string
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  targetDate: string
  contributions?: Record<string, number>
}

export interface RecurringItem {
  id: string
  name: string
  amount: number
  category: string
  cadence: 'interval' | 'monthly'
  intervalDays?: number
  dayOfMonth?: number
  lastProcessedOn: string
}

export const DEFAULT_PREFS: Prefs = {
  categories: ['Food', 'Transport', 'Data', 'Shopping', 'Other'],
  favorites: ['Food', 'Transport', 'Data'],
  dismissed: [],
  comfortBuffer: 0.1,
}

const WINDOW_DAYS = 30
export const SUGGEST_AFTER = 5

/** How often each category was used in the last 30 days. */
export function recentCounts(expenses: Expense[], today: string) {
  const counts: Record<string, number> = {}
  for (const e of expenses) {
    if (!e.excluded && !e.deleted && daysBetween(e.date, today) <= WINDOW_DAYS) counts[e.category] = (counts[e.category] ?? 0) + 1
  }
  return counts
}

/** Favorites ordered by recent use; ties keep their existing order. */
export const rankFavorites = (prefs: Prefs, counts: Record<string, number>) =>
  [...prefs.favorites].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

/** The most-used non-favorite category that has crossed the threshold. */
export function suggestion(prefs: Prefs, counts: Record<string, number>) {
  let best: string | null = null
  for (const c of prefs.categories) {
    if (prefs.favorites.includes(c) || prefs.dismissed.includes(c)) continue
    const n = counts[c] ?? 0
    if (n >= SUGGEST_AFTER && (best === null || n > (counts[best] ?? 0))) best = c
  }
  return best
}
