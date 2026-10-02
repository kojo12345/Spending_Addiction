import { cycleIncome, type Cycle, type Expense } from './types'
import type { PlannedExpense } from './categories'

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const daysBetween = (from: string, to: string) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)

/**
 * Rollover allowance: everything not yet spent before today is shared across
 * the days left (today included), so unspent money carries forward and
 * overspending shrinks tomorrow's number automatically.
 */
export function summarise(
  cycle: Cycle,
  expenses: Expense[],
  today: string,
  options: { dayWeights?: Record<string, number>; plannedExpenses?: PlannedExpense[] } = {},
) {
  const mine = expenses.filter((e) => e.cycleId === cycle.id && !e.excluded && !e.deleted)
  const spendable = cycleIncome(cycle) - cycle.fixedBills - cycle.savings
  const amountWithFee = (e: Expense) => e.amount + (e.fee ?? 0)
  const spentTotal = mine.reduce((t, e) => t + amountWithFee(e), 0)
  const spentToday = mine.filter((e) => e.date === today).reduce((t, e) => t + amountWithFee(e), 0)
  const daysLeft = Math.max(1, daysBetween(today, cycle.nextPayday))
  const totalDays = Math.max(1, daysBetween(cycle.startDate, cycle.nextPayday))
  const weightFor = (date: string) => options.dayWeights?.[date] === 1.5 || options.dayWeights?.[date] === 0.5 ? options.dayWeights[date] : 1
  const remainingDates = Array.from({ length: daysLeft }, (_, index) => {
    const date = new Date(`${today}T00:00:00`)
    date.setDate(date.getDate() + index)
    return toISO(date)
  })
  const remainingWeight = remainingDates.reduce((total, date) => total + weightFor(date), 0)
  const reserved = (options.plannedExpenses ?? [])
    .filter((expense) => expense.cycleId === cycle.id && expense.date >= today && expense.date <= cycle.nextPayday)
    .reduce((total, expense) => total + expense.amount, 0)
  const allowance = ((spendable - (spentTotal - spentToday) - reserved) * weightFor(today)) / remainingWeight
  return {
    spendable,
    reserved,
    spentTotal,
    spentToday,
    daysLeft,
    totalDays,
    allowance,
    remainingToday: allowance - spentToday,
    leftInCycle: spendable - spentTotal,
  }
}

export function completedDayStreak(
  cycle: Cycle,
  expenses: Expense[],
  today: string,
  dayWeights: Record<string, number> = {},
) {
  const yesterdayDate = new Date(`${today}T00:00:00`)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = toISO(yesterdayDate)
  if (yesterday < cycle.startDate) return 0

  const cycleEndDate = new Date(`${cycle.nextPayday}T00:00:00`)
  cycleEndDate.setDate(cycleEndDate.getDate() - 1)
  const cycleEnd = toISO(cycleEndDate)
  const end = yesterday < cycleEnd ? yesterday : cycleEnd
  if (end < cycle.startDate) return 0
  const days = daysBetween(cycle.startDate, end) + 1
  const weights = Array.from({ length: days }, (_, index) => {
    const date = new Date(`${cycle.startDate}T00:00:00`)
    date.setDate(date.getDate() + index)
    const iso = toISO(date)
    return dayWeights[iso] === 1.5 || dayWeights[iso] === 0.5 ? dayWeights[iso] : 1
  })
  let remainingWeight = weights.reduce((total, weight) => total + weight, 0)
  let remainingBudget = cycleIncome(cycle) - cycle.fixedBills - cycle.savings
  let streak = 0
  const totalsByDate = expenses.reduce<Record<string, number>>((totals, expense) => {
    if (expense.cycleId === cycle.id && !expense.excluded && !expense.deleted && expense.date >= cycle.startDate && expense.date <= end) {
      totals[expense.date] = (totals[expense.date] ?? 0) + expense.amount + (expense.fee ?? 0)
    }
    return totals
  }, {})

  for (let index = 0; index < days; index++) {
    const weight = weights[index]
    const allowance = remainingBudget * weight / remainingWeight
    const date = new Date(`${cycle.startDate}T00:00:00`)
    date.setDate(date.getDate() + index)
    const spent = totalsByDate[toISO(date)] ?? 0
    streak = spent <= allowance ? streak + 1 : 0
    remainingBudget -= spent
    remainingWeight -= weight
  }
  return streak
}

export const money = (n: number) =>
  `${n < 0 ? '-' : ''}GH₵${Math.abs(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const sumOf = (list: Expense[]) => list.reduce((t, e) => t + (!e.excluded && !e.deleted ? e.amount + (e.fee ?? 0) : 0), 0)
