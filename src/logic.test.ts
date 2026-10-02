import { describe, expect, it } from 'vitest'
import { completedDayStreak, summarise, sumOf } from './logic'
import type { Cycle, Expense } from './types'

const cycle: Cycle = {
  id: 'cycle', startDate: '2026-01-01', nextPayday: '2026-01-20', income: 1000, fixedBills: 0, savings: 0,
}

describe('summarise', () => {
  it('rolls underspending from prior days into today', () => {
    const expenses: Expense[] = [
      { id: 'past', cycleId: 'cycle', amount: 100, category: 'Food', note: '', date: '2026-01-09', createdAt: 1 },
    ]
    const result = summarise(cycle, expenses, '2026-01-10')
    expect(result.allowance).toBe(900 / 10)
    expect(result.remainingToday).toBe(90)
  })

  it('reduces today to account for overspending on earlier days', () => {
    const expenses: Expense[] = [
      { id: 'past', cycleId: 'cycle', amount: 120, category: 'Food', note: '', date: '2026-01-09', createdAt: 1 },
    ]
    const result = summarise(cycle, expenses, '2026-01-10')
    expect(result.allowance).toBe(880 / 10)
    expect(result.remainingToday).toBe(88)
  })

  it('counts back-dated expenses as prior spending, not spending today', () => {
    const expenses: Expense[] = [
      { id: 'past', cycleId: 'cycle', amount: 100, category: 'Food', note: '', date: '2026-01-09', createdAt: 1 },
      { id: 'today', cycleId: 'cycle', amount: 25, category: 'Food', note: '', date: '2026-01-10', createdAt: 2 },
    ]
    const result = summarise(cycle, expenses, '2026-01-10')
    expect(result.spentToday).toBe(25)
    expect(result.allowance).toBe(90)
    expect(result.remainingToday).toBe(65)
  })

  it('keeps the final day as one allowance day', () => {
    const result = summarise(cycle, [], '2026-01-20')
    expect(result.daysLeft).toBe(1)
    expect(result.allowance).toBe(1000)
  })

  it('uses one day when payday has passed and no days remain', () => {
    const result = summarise(cycle, [], '2026-01-21')
    expect(result.daysLeft).toBe(1)
    expect(result.allowance).toBe(1000)
  })

  it('keeps excluded costs out of the allowance but includes a transfer fee', () => {
    const expenses: Expense[] = [
      { id: 'included', cycleId: 'cycle', amount: 25, fee: 2, category: 'Food', note: '', date: '2026-01-10', createdAt: 1 },
      { id: 'excluded', cycleId: 'cycle', amount: 500, category: 'Medical', note: '', date: '2026-01-10', createdAt: 2, excluded: true },
    ]
    const result = summarise(cycle, expenses, '2026-01-10')
    expect(result.spentTotal).toBe(27)
    expect(result.spentToday).toBe(27)
    expect(sumOf(expenses)).toBe(27)
  })

  it('distributes the remaining budget according to today’s day weight', () => {
    const heavier = summarise(cycle, [], '2026-01-10', { dayWeights: { '2026-01-10': 1.5 } })
    const lighter = summarise(cycle, [], '2026-01-10', { dayWeights: { '2026-01-10': 0.5 } })
    expect(heavier.allowance).toBeCloseTo(1000 * 1.5 / 10.5)
    expect(lighter.allowance).toBeCloseTo(1000 * 0.5 / 9.5)
  })

  it('reserves planned expenses when calculating the daily allowance', () => {
    const result = summarise(cycle, [], '2026-01-10', {
      plannedExpenses: [{ id: 'plan', cycleId: 'cycle', name: 'Trip', amount: 200, date: '2026-01-15' }],
    })
    expect(result.reserved).toBe(200)
    expect(result.allowance).toBe(80)
  })
})

describe('completedDayStreak', () => {
  it('counts consecutive completed days within their allowance', () => {
    expect(completedDayStreak(cycle, [], '2026-01-04')).toBe(3)
  })

  it('resets after a day exceeds its allowance', () => {
    const expenses: Expense[] = [
      { id: 'over', cycleId: 'cycle', amount: 1100, category: 'Other', note: '', date: '2026-01-03', createdAt: 1 },
    ]
    expect(completedDayStreak(cycle, expenses, '2026-01-04')).toBe(0)
  })
})