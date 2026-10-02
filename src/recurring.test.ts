import { describe, expect, it } from 'vitest'
import { advanceRecurring } from './recurring'
import type { RecurringItem } from './categories'

const daily: RecurringItem = {
  id: 'rent', name: 'Daily item', amount: 10, category: 'Other', cadence: 'interval', intervalDays: 2, lastProcessedOn: '2026-10-01',
}

describe('advanceRecurring', () => {
  it('catches up every missed interval through today', () => {
    const result = advanceRecurring([daily], '2026-10-07')
    expect(result.occurrences.map((item) => item.date)).toEqual(['2026-10-03', '2026-10-05', '2026-10-07'])
    expect(result.items[0].lastProcessedOn).toBe('2026-10-07')
  })

  it('clamps monthly schedules to the last day of short months', () => {
    const monthly: RecurringItem = { ...daily, cadence: 'monthly', dayOfMonth: 31, lastProcessedOn: '2026-01-31' }
    const result = advanceRecurring([monthly], '2026-03-31')
    expect(result.occurrences.map((item) => item.date)).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('schedules a future day in the current month', () => {
    const monthly: RecurringItem = { ...daily, cadence: 'monthly', dayOfMonth: 25, lastProcessedOn: '2026-10-02' }
    expect(advanceRecurring([monthly], '2026-10-25').occurrences.map((item) => item.date)).toEqual(['2026-10-25'])
  })

  it('does not repeat dates already processed', () => {
    const result = advanceRecurring([{ ...daily, lastProcessedOn: '2026-10-07' }], '2026-10-07')
    expect(result.occurrences).toEqual([])
  })
})