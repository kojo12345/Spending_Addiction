import { toISO } from './logic'
import type { RecurringItem } from './categories'

export interface DueOccurrence {
  recurringId: string
  date: string
}

function nextDate(item: RecurringItem, after: string): string | null {
  const date = new Date(`${after}T00:00:00`)
  if (item.cadence === 'interval') {
    if (!item.intervalDays || item.intervalDays < 1) return null
    date.setDate(date.getDate() + item.intervalDays)
    return toISO(date)
  }
  if (!item.dayOfMonth || item.dayOfMonth < 1 || item.dayOfMonth > 31) return null
  const setScheduledDay = (year: number, month: number) => {
    const monthEnd = new Date(year, month + 1, 0).getDate()
    return new Date(year, month, Math.min(item.dayOfMonth!, monthEnd))
  }
  let scheduled = setScheduledDay(date.getFullYear(), date.getMonth())
  if (scheduled <= date) {
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1)
    scheduled = setScheduledDay(nextMonth.getFullYear(), nextMonth.getMonth())
  }
  return toISO(scheduled)
}

export function advanceRecurring(items: RecurringItem[], today: string) {
  const occurrences: DueOccurrence[] = []
  const advanced = items.map((item) => {
    let lastProcessedOn = item.lastProcessedOn
    let next = nextDate(item, lastProcessedOn)
    while (next && next <= today) {
      occurrences.push({ recurringId: item.id, date: next })
      lastProcessedOn = next
      next = nextDate(item, lastProcessedOn)
    }
    return lastProcessedOn === item.lastProcessedOn ? item : { ...item, lastProcessedOn }
  })
  return { items: advanced, occurrences }
}