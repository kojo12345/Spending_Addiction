import type { Prefs } from './categories'

export interface Cycle {
  id: string
  startDate: string // yyyy-mm-dd, the payday this cycle began
  nextPayday: string // yyyy-mm-dd
  income: number
  incomeSources?: IncomeSource[]
  fixedBills: number
  savings: number
  endedOn?: string // set when the cycle is closed
  carriedOver?: number
  updatedAt?: number
  deleted?: boolean
}

export interface IncomeSource {
  label: string
  amount: number
}

export interface Expense {
  id: string
  cycleId: string
  amount: number
  category: string
  note: string
  date: string // yyyy-mm-dd
  createdAt: number
  excluded?: boolean
  fee?: number
  tags?: string[]
  receiptPath?: string
  updatedAt?: number
  deleted?: boolean
}

export const cycleIncome = (cycle: Cycle) =>
  cycle.incomeSources?.length
    ? cycle.incomeSources.reduce((total, source) => total + source.amount, 0)
    : cycle.income

export interface AppState {
  cycles: Cycle[]
  expenses: Expense[]
  prefs: Prefs
  updatedAt: number
  prefsUpdatedAt?: number
}
