import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { cycleIncome } from './types'
import type { AppState, Cycle, Expense, IncomeSource } from './types'
import { completedDayStreak, daysBetween, summarise, toISO } from './logic'
import { usePersistentState } from './store'
import { DEFAULT_PREFS, recentCounts } from './categories'
import type { Prefs } from './categories'
import type { PlannedExpense, SavingsGoal } from './categories'
import CategoryPicker from './CategoryPicker'
import History from './History'
import Report from './Report'
import Account from './Account'
import { useSync } from './sync'
import { migrateState } from './merge'
import { advanceRecurring } from './recurring'
import type { RecurringItem } from './categories'
import { pinIsConfigured, verifyPin } from './pin'
import { cacheReceipt, compressReceipt, readCachedReceipt } from './receiptCache'
import { supabase } from './supabase'
import Search from './Search'
import Insights from './Insights'

const money = (n: number) =>
  `${n < 0 ? '-' : ''}GH₵${Math.abs(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function Setup({ previous, expenses, onStart }: { previous: Cycle | null; expenses: Expense[]; onStart: (c: Cycle) => void }) {
  const today = toISO(new Date())
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([{ label: 'Income', amount: 0 }])
  const [bills, setBills] = useState(previous ? String(previous.fixedBills) : '')
  const [savings, setSavings] = useState(previous ? String(previous.savings) : '')
  const [startDate, setStartDate] = useState(today)
  const [payday, setPayday] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return toISO(d)
  })
  const [balanceChoice, setBalanceChoice] = useState<'carry' | 'save' | 'deduct' | 'leave'>('save')

  const previousBalance = previous
    ? cycleIncome(previous) - previous.fixedBills - previous.savings - expenses.filter((e) => e.cycleId === previous.id && !e.deleted && !e.excluded).reduce((sum, e) => sum + e.amount + (e.fee ?? 0), 0)
    : 0
  const adjustment = previousBalance > 0 && balanceChoice === 'carry'
    ? previousBalance
    : previousBalance < 0 && balanceChoice === 'deduct'
      ? previousBalance
      : 0

  const inc = incomeSources.reduce((sum, source) => sum + (Number(source.amount) || 0), 0)
  const spendable = inc + adjustment - (Number(bills) || 0) - (Number(savings) || 0)
  const days = daysBetween(startDate, payday)
  const valid = inc > 0 && incomeSources.every((source) => !(Number(source.amount) > 0) || Boolean(source.label.trim())) && spendable > 0 && days > 0 && startDate <= today && payday > startDate

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onStart({
      id: crypto.randomUUID(),
      startDate,
      nextPayday: payday,
      income: inc + adjustment,
      incomeSources: [
        ...incomeSources.filter((source) => Number(source.amount) > 0),
        ...(adjustment ? [{ label: 'Carryover', amount: adjustment }] : []),
      ],
      fixedBills: Number(bills) || 0,
      savings: Number(savings) || 0,
      ...(adjustment > 0 ? { carriedOver: adjustment } : {}),
    })
  }

  return (
    <main className="screen">
      <h1 className="title">Start a new cycle</h1>
      <p className="muted">Enter what you got paid and what is already spoken for.</p>
      <form className="card stack" onSubmit={submit}>
        <div className="income-source-list">
          <strong>Income sources</strong>
          {incomeSources.map((source, index) => <div className="income-source" key={index}>
            <input aria-label={`Income source ${index + 1} name`} value={source.label} onChange={(e) => setIncomeSources((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item))} placeholder="Salary" maxLength={32} />
            <input aria-label={`Income source ${index + 1} amount`} inputMode="decimal" type="number" min="0" step="0.01" value={source.amount || ''} onChange={(e) => setIncomeSources((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(e.target.value) || 0 } : item))} placeholder="0.00" />
            {incomeSources.length > 1 && <button type="button" className="ghost" aria-label={`Remove income source ${index + 1}`} onClick={() => setIncomeSources((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
          </div>)}
          <button type="button" className="link" onClick={() => setIncomeSources((items) => [...items, { label: '', amount: 0 }])}>Add income source</button>
          <p className="muted small">Total: {money(inc)}</p>
        </div>
        <label className="field">
          <span>Fixed bills (rent, data, subscriptions)</span>
          <input inputMode="decimal" type="number" min="0" value={bills} onChange={(e) => setBills(e.target.value)} placeholder="0.00" />
        </label>
        <label className="field">
          <span>Savings to set aside</span>
          <input inputMode="decimal" type="number" min="0" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="0.00" />
        </label>
        <label className="field">
          <span>Payday (cycle start)</span>
          <input type="date" max={today} value={startDate} onChange={(e) => {
            const nextStart = e.target.value
            setStartDate(nextStart)
            if (payday <= nextStart) {
              const d = new Date(`${nextStart}T00:00:00`)
              d.setDate(d.getDate() + 30)
              setPayday(toISO(d))
            }
          }} />
        </label>
        <label className="field">
          <span>Next payday</span>
          <input type="date" min={startDate} value={payday} onChange={(e) => setPayday(e.target.value)} />
        </label>
        {previous && previousBalance > 0 && (
          <fieldset className="choice">
            <legend>Previous cycle leftover: {money(previousBalance)}</legend>
            <label><input type="radio" name="balance" checked={balanceChoice === 'carry'} onChange={() => setBalanceChoice('carry')} /> Carry {money(previousBalance)} into this cycle</label>
            <label><input type="radio" name="balance" checked={balanceChoice === 'save'} onChange={() => setBalanceChoice('save')} /> Count it as savings</label>
          </fieldset>
        )}
        {previous && previousBalance < 0 && (
          <fieldset className="choice">
            <legend>Previous cycle overspent by {money(-previousBalance)}</legend>
            <label><input type="radio" name="balance" checked={balanceChoice === 'deduct'} onChange={() => setBalanceChoice('deduct')} /> Deduct it from this cycle</label>
            <label><input type="radio" name="balance" checked={balanceChoice === 'leave'} onChange={() => setBalanceChoice('leave')} /> Start without deducting it</label>
          </fieldset>
        )}
        {valid && (
          <p className="preview">
            About <strong>{money(spendable / days)}</strong> a day for {days} days.
          </p>
        )}
        <button className="primary" type="submit" disabled={!valid}>
          Start cycle
        </button>
      </form>
    </main>
  )
}

function Home({
  cycle,
  expenses,
  onAdd,
  onEdit,
  onDelete,
  onReceipt,
  onLoadReceipt,
  onPayday,
  onRecurringUpdate,
  onNewCycle,
  onRenameCategory,
  onDeleteCategory,
  recap,
  onDismissRecap,
  reminderSetupError,
  prefs,
  onPrefs,
}: {
  cycle: Cycle
  expenses: Expense[]
  onAdd: (e: Expense) => void
  onEdit: (e: Expense) => void
  onDelete: (id: string) => void
  onReceipt: (expenseId: string, blob: Blob, dataUrl: string) => Promise<string | undefined>
  onLoadReceipt: (expense: Expense) => Promise<string | undefined>
  onPayday: (date: string) => void
  onRecurringUpdate: (items: RecurringItem[]) => void
  onNewCycle: () => void
  onRenameCategory: (category: string, nextName: string) => void
  onDeleteCategory: (category: string) => void
  recap: { spent: number; allowance: number; rolled: number } | null
  onDismissRecap: () => void
  reminderSetupError: string
  prefs: Prefs
  onPrefs: (p: Prefs) => void
}) {
  const today = toISO(new Date())
  const s = summarise(cycle, expenses, today, { dayWeights: prefs.dayWeights, plannedExpenses: prefs.plannedExpenses })
  const streak = completedDayStreak(cycle, expenses, today, prefs.dayWeights)
  const buffer = Math.min(0.5, Math.max(0, prefs.comfortBuffer ?? 0.1))
  const comfortableAllowance = s.allowance * (1 - buffer)
  const comfortableRemaining = comfortableAllowance - s.spentToday
  const counts = recentCounts(expenses, today)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(prefs.favorites[0] ?? prefs.categories[0])
  const [note, setNote] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [expenseDate, setExpenseDate] = useState(today)
  const [excluded, setExcluded] = useState(false)
  const [feeEnabled, setFeeEnabled] = useState(false)
  const [fee, setFee] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editTagsText, setEditTagsText] = useState('')
  const [editReceipt, setEditReceipt] = useState<{ blob: Blob; dataUrl: string } | null>(null)
  const [receiptPreview, setReceiptPreview] = useState('')
  const [receiptError, setReceiptError] = useState('')
  const [editDate, setEditDate] = useState(today)
  const [editExcluded, setEditExcluded] = useState(false)
  const [editFee, setEditFee] = useState('')
  const [paydayOpen, setPaydayOpen] = useState(false)
  const [paydayDraft, setPaydayDraft] = useState(cycle.nextPayday)
  const [affordAmount, setAffordAmount] = useState('')
  const [recurringName, setRecurringName] = useState('')
  const [recurringAmount, setRecurringAmount] = useState('')
  const [recurringCategory, setRecurringCategory] = useState(prefs.categories[0] ?? 'Other')
  const [recurringCadence, setRecurringCadence] = useState<'interval' | 'monthly'>('interval')
  const [recurringInterval, setRecurringInterval] = useState('7')
  const [recurringDay, setRecurringDay] = useState('1')
  const [weightsOpen, setWeightsOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planAmount, setPlanAmount] = useState('')
  const [planDate, setPlanDate] = useState(today)
  const [plannedToLog, setPlannedToLog] = useState<string | null>(null)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [goalContributions, setGoalContributions] = useState<Record<string, string>>({})
  const [reminderMessage, setReminderMessage] = useState('')

  const over = s.remainingToday < 0
  const pct = s.allowance > 0 ? Math.min(100, (s.spentToday / s.allowance) * 100) : 100
  const recent = expenses
    .filter((e) => e.cycleId === cycle.id && !e.deleted)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
  const cycleExpenses = expenses.filter((e) => e.cycleId === cycle.id)
  const spentByCategory = cycleExpenses.reduce<Record<string, number>>((totals, expense) => {
    if (!expense.excluded && !expense.deleted) {
      totals[expense.category] = (totals[expense.category] ?? 0) + expense.amount
      if (expense.fee) totals.Fees = (totals.Fees ?? 0) + expense.fee
    }
    return totals
  }, {})
  const sevenDaysAgo = new Date(`${today}T00:00:00`)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const paceStart = toISO(sevenDaysAgo) < cycle.startDate ? cycle.startDate : toISO(sevenDaysAgo)
  const paceExpenses = cycleExpenses.filter((e) => !e.excluded && !e.deleted && e.date >= paceStart && e.date <= today)
  const paceDays = new Set(paceExpenses.filter((e) => e.amount + (e.fee ?? 0) > 0).map((e) => e.date)).size
  const paceWindowDays = Math.max(1, daysBetween(paceStart, today) + 1)
  const averagePace = paceExpenses.reduce((sum, e) => sum + e.amount + (e.fee ?? 0), 0) / paceWindowDays
  const runoutDays = averagePace > 0 ? Math.max(0, s.leftInCycle) / averagePace : Infinity
  const showPaceWarning = paceDays >= 3 && runoutDays < s.daysLeft
  const runoutDate = new Date(`${today}T00:00:00`)
  runoutDate.setDate(runoutDate.getDate() + Math.ceil(runoutDays))
  const runoutLabel = runoutDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const hypotheticalSpend = Number(affordAmount) || 0
  const projectedRemainingToday = s.remainingToday - hypotheticalSpend
  const projectedDailyAfterToday = (s.spendable - s.spentTotal - hypotheticalSpend) / Math.max(1, s.daysLeft - 1)
  const cyclePlans = (prefs.plannedExpenses ?? []).filter((plan) => plan.cycleId === cycle.id).sort((a, b) => a.date.localeCompare(b.date))
  const duePlans = cyclePlans.filter((plan) => plan.date <= today)
  const cycleDays = Math.max(1, daysBetween(cycle.startDate, cycle.nextPayday))
  const assignedSavings = (prefs.savingsGoals ?? []).reduce((total, goal) => total + (goal.contributions?.[cycle.id] ?? 0), 0)
  const calendarDays = Array.from({ length: Math.min(14, Math.max(1, daysBetween(today, cycle.nextPayday))) }, (_, index) => {
    const date = new Date(`${today}T00:00:00`)
    date.setDate(date.getDate() + index)
    return toISO(date)
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount)
    if (!(value > 0)) return
    const prior = expenses.filter((expense) => expense.category === category && !expense.excluded && !expense.deleted).map((expense) => expense.amount + (expense.fee ?? 0)).sort((a, b) => a - b)
    if (prior.length >= 5) {
      const middle = Math.floor(prior.length / 2)
      const median = prior.length % 2 ? prior[middle] : (prior[middle - 1] + prior[middle]) / 2
      if (median > 0 && value > median * 3 && !window.confirm(`This is more than 3× your typical ${category} expense (${money(median)}). Log it anyway?`)) return
    }
    onAdd({ id: crypto.randomUUID(), cycleId: cycle.id, amount: value, category, note: note.trim(), date: expenseDate, createdAt: Date.now(), excluded, tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean), ...(feeEnabled && Number(fee) > 0 ? { fee: Number(fee) } : {}) })
    if (plannedToLog) {
      onPrefs({ ...prefs, plannedExpenses: (prefs.plannedExpenses ?? []).filter((plan) => plan.id !== plannedToLog) })
      setPlannedToLog(null)
    }
    setAmount('')
    setNote('')
    setTagsText('')
    setExpenseDate(today)
    setExcluded(false)
    setFeeEnabled(false)
    setFee('')
  }

  const openExpense = (expense: Expense) => {
    setEditing(expense)
    setEditAmount(String(expense.amount))
    setEditCategory(expense.category)
    setEditNote(expense.note)
    setEditTagsText((expense.tags ?? []).join(', '))
    setEditReceipt(null)
    setReceiptPreview('')
    setReceiptError('')
    void readCachedReceipt(expense.id).then(async (dataUrl) => {
      if (dataUrl) setReceiptPreview(dataUrl)
      else if (expense.receiptPath) setReceiptPreview(await onLoadReceipt(expense) ?? '')
    }).catch((error: unknown) => setReceiptError(error instanceof Error ? error.message : 'Unable to load the receipt.'))
    setEditDate(expense.date)
    setEditExcluded(expense.excluded ?? false)
    setEditFee(expense.fee ? String(expense.fee) : '')
  }

  const saveExpense = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !(Number(editAmount) > 0)) return
    let receiptPath = editing.receiptPath
    if (editReceipt) {
      try {
        receiptPath = await onReceipt(editing.id, editReceipt.blob, editReceipt.dataUrl) ?? receiptPath
        setReceiptPreview(editReceipt.dataUrl)
      } catch (error) {
        setReceiptError(error instanceof Error ? error.message : 'Unable to save receipt.')
        return
      }
    }
    onEdit({ ...editing, amount: Number(editAmount), category: editCategory, note: editNote.trim(), date: editDate, excluded: editExcluded, tags: editTagsText.split(',').map((tag) => tag.trim()).filter(Boolean), receiptPath, ...(Number(editFee) > 0 ? { fee: Number(editFee) } : { fee: undefined }) })
    setEditing(null)
  }

  const addRecurring = (e: FormEvent) => {
    e.preventDefault()
    const value = Number(recurringAmount)
    if (!recurringName.trim() || !(value > 0)) return
    const item: RecurringItem = {
      id: crypto.randomUUID(),
      name: recurringName.trim(),
      amount: value,
      category: recurringCategory,
      cadence: recurringCadence,
      ...(recurringCadence === 'interval' ? { intervalDays: Number(recurringInterval) } : { dayOfMonth: Number(recurringDay) }),
      lastProcessedOn: today,
    }
    onRecurringUpdate([...(prefs.recurringItems ?? []), item])
    setRecurringName('')
    setRecurringAmount('')
  }

  const addPlannedExpense = (e: FormEvent) => {
    e.preventDefault()
    const value = Number(planAmount)
    if (!planName.trim() || !(value > 0) || planDate < today) return
    const plan: PlannedExpense = { id: crypto.randomUUID(), cycleId: cycle.id, name: planName.trim(), amount: value, date: planDate }
    onPrefs({ ...prefs, plannedExpenses: [...(prefs.plannedExpenses ?? []), plan] })
    setPlanName('')
    setPlanAmount('')
  }

  const createSavingsGoal = (e: FormEvent) => {
    e.preventDefault()
    const targetAmount = Number(goalTarget)
    if (!goalName.trim() || !(targetAmount > 0) || !goalDate || goalDate < today) return
    const goal: SavingsGoal = { id: crypto.randomUUID(), name: goalName.trim(), targetAmount, targetDate: goalDate, contributions: {} }
    onPrefs({ ...prefs, savingsGoals: [...(prefs.savingsGoals ?? []), goal] })
    setGoalName('')
    setGoalTarget('')
    setGoalDate('')
  }

  const assignGoalSavings = (goal: SavingsGoal) => {
    const amount = Number(goalContributions[goal.id])
    const existing = goal.contributions?.[cycle.id] ?? 0
    const remainingCapacity = cycle.savings - assignedSavings + existing
    const goalRemaining = goal.targetAmount - Object.values(goal.contributions ?? {}).reduce((total, value) => total + value, 0)
    if (!(amount > 0) || amount > remainingCapacity || amount > goalRemaining) return
    onPrefs({
      ...prefs,
      savingsGoals: (prefs.savingsGoals ?? []).map((entry) => entry.id === goal.id
        ? { ...entry, contributions: { ...entry.contributions, [cycle.id]: amount } }
        : entry),
    })
    setGoalContributions((values) => ({ ...values, [goal.id]: '' }))
  }

  const setDayWeight = (date: string, weight: number) => {
    const weights = { ...prefs.dayWeights }
    if (weight === 1) delete weights[date]
    else weights[date] = weight
    onPrefs({ ...prefs, dayWeights: weights })
  }

  const setMorningReminder = async (enabled: boolean) => {
    if (!enabled) {
      onPrefs({ ...prefs, morningReminder: { enabled: false, time: prefs.morningReminder?.time ?? '08:00' } })
      setReminderMessage('')
      return
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setReminderMessage('Notifications are not supported by this browser.')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setReminderMessage('Allow notifications in your browser settings to enable reminders.')
      return
    }
    onPrefs({ ...prefs, morningReminder: { enabled: true, time: prefs.morningReminder?.time ?? '08:00' } })
    setReminderMessage('Morning reminder enabled.')
  }

  return (
    <main className="screen">
      {recap && (
        <section className="card recap" role="status">
          <button className="ghost" aria-label="Dismiss yesterday's recap" onClick={onDismissRecap}>×</button>
          <strong>Yesterday</strong>
          <p>Spent {money(recap.spent)} of {money(recap.allowance)}; {money(recap.rolled)} rolled into today.</p>
        </section>
      )}
      <section className={`hero${over ? ' over' : ''}`} aria-live="polite">
        <p className="hero-label">{comfortableAllowance > 0 ? 'Comfortable to spend' : 'Nothing left to spend'}</p>
        <p className="hero-amount">{money(Math.max(0, comfortableRemaining))}</p>
        <p className="hero-safe">Safe to spend: {money(Math.max(0, s.remainingToday))}</p>
        <div className="bar" role="presentation"><span style={{ width: `${pct}%` }} /></div>
        <p className="hero-sub">
          {over
            ? `${money(-s.remainingToday)} over today's safe amount. Tomorrow's amount adjusts.`
            : `${money(s.spentToday)} spent of ${money(s.allowance)} safe today`}
        </p>
      </section>
      {streak > 0 && <p className="card streak" role="status">{streak}-day streak: spent within your allowance.</p>}

      <section className="stats">
        <div className="card stat">
          <span className="muted">Left this cycle</span>
          <strong>{money(s.leftInCycle)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Days to payday</span>
          <button className="value-edit" onClick={() => { setPaydayDraft(cycle.nextPayday); setPaydayOpen(true) }} aria-label="Edit next payday">
            <strong>{s.daysLeft}</strong><span className="muted small">Edit</span>
          </button>
        </div>
      </section>

      <section className="card day-weight-panel">
        <div className="day-weight-heading">
          <div><strong>Plan daily weights</strong><p className="muted small">Heavier days get more; lighter days get less.</p></div>
          <button type="button" className="mini" onClick={() => setWeightsOpen(true)}>Calendar</button>
        </div>
      </section>

      {duePlans.length > 0 && (
        <section className="card stack tight" aria-label="Planned expenses due">
          <h2 className="h2">Planned expense due</h2>
          {duePlans.map((plan) => <div className="planned-due" key={plan.id}>
            <span><strong>{plan.name}</strong><span className="muted small">{money(plan.amount)} · planned for {plan.date}</span></span>
            <button type="button" className="mini" onClick={() => {
              setAmount(String(plan.amount))
              setNote(plan.name)
              setExpenseDate(plan.date)
              setPlannedToLog(plan.id)
              document.querySelector('input.amount')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}>Log actual</button>
          </div>)}
        </section>
      )}

      <section className="card health" aria-label="Cycle health">
        <div className="health-heading"><strong>Cycle health</strong><span className="muted small">{money(Math.max(0, s.leftInCycle))} left · {s.daysLeft} days</span></div>
        <div className="track" role="progressbar" aria-label="Money remaining compared with cycle budget" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, (s.leftInCycle / Math.max(1, s.spendable)) * 100))}>
          <span className={showPaceWarning ? 'limit-hit' : ''} style={{ width: `${Math.max(0, Math.min(100, (s.leftInCycle / Math.max(1, s.spendable)) * 100))}%` }} />
        </div>
        {showPaceWarning && <p className="pace-warning" role="status">At this pace you may run out around {runoutLabel}, {Math.max(1, Math.ceil(s.daysLeft - runoutDays))} day{Math.ceil(s.daysLeft - runoutDays) === 1 ? '' : 's'} before payday.</p>}
      </section>

      <section className="card stack tight">
        <h2 className="h2">Can I afford this?</h2>
        <label className="field"><span>Amount to check</span><input inputMode="decimal" type="number" min="0" step="0.01" value={affordAmount} onChange={(e) => setAffordAmount(e.target.value)} placeholder="0.00" /></label>
        {hypotheticalSpend > 0 && <p className={`preview${projectedRemainingToday < 0 ? ' bad' : ''}`}>
          After spending {money(hypotheticalSpend)}: {money(projectedRemainingToday)} left today. Tomorrow's allowance would be {money(projectedDailyAfterToday)}.
        </p>}
      </section>

      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>Log an expense</span>
          <input className="amount" inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        <CategoryPicker prefs={prefs} onPrefs={onPrefs} counts={counts} value={category} onChange={setCategory} spentByCategory={spentByCategory} onRenameCategory={onRenameCategory} onDeleteCategory={onDeleteCategory} />
        <input className="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        <input aria-label="Tags (comma separated)" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Tags (optional, comma separated)" />
        <label className="field"><span>Date</span><input type="date" min={cycle.startDate} max={today} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></label>
        <label className="toggle"><input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} /><span>Outside budget / reimbursable</span></label>
        <label className="toggle"><input type="checkbox" checked={feeEnabled} onChange={(e) => setFeeEnabled(e.target.checked)} /><span>Add transfer fee</span></label>
        {feeEnabled && <label className="field"><span>Transfer fee</span><input inputMode="decimal" type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" /></label>}
        <button className="primary" type="submit" disabled={!(Number(amount) > 0)}>
          Add expense
        </button>
      </form>

      <details className="card recurring-panel">
        <summary>Planned one-off expenses <span className="muted small">{cyclePlans.length}</span></summary>
        {cyclePlans.length > 0 && <ul className="recurring-list">
          {cyclePlans.map((plan) => <li key={plan.id}>
            <span><strong>{plan.name}</strong><span className="muted small">{plan.date} · {money(plan.amount)}</span></span>
            <button type="button" className="ghost" aria-label={`Remove planned ${plan.name}`} onClick={() => onPrefs({ ...prefs, plannedExpenses: (prefs.plannedExpenses ?? []).filter((entry) => entry.id !== plan.id) })}>×</button>
          </li>)}
        </ul>}
        <form className="stack recurring-form" onSubmit={addPlannedExpense}>
          <label className="field"><span>Name</span><input value={planName} onChange={(e) => setPlanName(e.target.value)} maxLength={48} placeholder="Trip, repair, etc." /></label>
          <label className="field"><span>Amount</span><input inputMode="decimal" type="number" min="0.01" step="0.01" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} placeholder="0.00" /></label>
          <label className="field"><span>Date</span><input type="date" min={today} max={cycle.nextPayday} value={planDate} onChange={(e) => setPlanDate(e.target.value)} /></label>
          <button className="primary" type="submit" disabled={!planName.trim() || !(Number(planAmount) > 0) || planDate < today}>Add planned expense</button>
        </form>
      </details>

      <details className="card recurring-panel">
        <summary>Morning reminder <span className="muted small">{prefs.morningReminder?.enabled ? 'On' : 'Off'}</span></summary>
        <label className="toggle"><input type="checkbox" checked={prefs.morningReminder?.enabled ?? false} onChange={(e) => void setMorningReminder(e.target.checked)} /><span>Notify me each morning</span></label>
        <label className="field"><span>Reminder time</span><input type="time" value={prefs.morningReminder?.time ?? '08:00'} onChange={(e) => onPrefs({ ...prefs, morningReminder: { enabled: prefs.morningReminder?.enabled ?? false, time: e.target.value } })} /></label>
        <p className="muted small">Notifications only work while the PWA is installed and permission is granted. iPhone support is limited; scheduled delivery depends on browser support.</p>
        {(reminderMessage || reminderSetupError) && <p className={`small${reminderSetupError ? ' bad' : ''}`} role="status">{reminderSetupError || reminderMessage}</p>}
      </details>

      <details className="card recurring-panel">
        <summary>Savings goals <span className="muted small">{prefs.savingsGoals?.length ?? 0}</span></summary>
        {(prefs.savingsGoals ?? []).map((goal) => {
          const total = Object.values(goal.contributions ?? {}).reduce((sum, value) => sum + value, 0)
          const remaining = Math.max(0, goal.targetAmount - total)
          const cyclesToTarget = Math.max(1, Math.ceil(Math.max(0, daysBetween(today, goal.targetDate)) / cycleDays))
          const required = remaining / cyclesToTarget
          const currentContribution = goal.contributions?.[cycle.id] ?? 0
          const maxAssign = cycle.savings - assignedSavings + currentContribution
          return <div className="goal-item" key={goal.id}>
            <div className="goal-heading"><strong>{goal.name}</strong><button type="button" className="danger-link" onClick={() => onPrefs({ ...prefs, savingsGoals: (prefs.savingsGoals ?? []).filter((entry) => entry.id !== goal.id) })}>Remove</button></div>
            <p className="muted small">{money(total)} of {money(goal.targetAmount)} · {goal.targetDate}</p>
            <p className="small">Required per cycle: <strong>{money(required)}</strong></p>
            <div className="goal-assign">
              <input aria-label={`Savings assigned to ${goal.name} this cycle`} inputMode="decimal" type="number" min="0" max={Math.min(maxAssign, remaining)} step="0.01" value={goalContributions[goal.id] ?? ''} placeholder={currentContribution ? String(currentContribution) : '0.00'} onChange={(e) => setGoalContributions((values) => ({ ...values, [goal.id]: e.target.value }))} />
              <button type="button" className="mini" onClick={() => assignGoalSavings(goal)} disabled={!(Number(goalContributions[goal.id]) > 0) || Number(goalContributions[goal.id]) > Math.min(maxAssign, remaining)}>Assign</button>
            </div>
          </div>
        })}
        {prefs.savingsGoals?.length ? <p className="muted small">Assigned this cycle: {money(assignedSavings)} of {money(cycle.savings)} savings.</p> : null}
        <form className="stack recurring-form" onSubmit={createSavingsGoal}>
          <label className="field"><span>Goal name</span><input value={goalName} onChange={(e) => setGoalName(e.target.value)} maxLength={48} placeholder="Emergency fund" /></label>
          <label className="field"><span>Target amount</span><input inputMode="decimal" type="number" min="0.01" step="0.01" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="0.00" /></label>
          <label className="field"><span>Target date</span><input type="date" min={today} value={goalDate} onChange={(e) => setGoalDate(e.target.value)} /></label>
          <button className="primary" type="submit" disabled={!goalName.trim() || !(Number(goalTarget) > 0) || !goalDate || goalDate < today}>Add savings goal</button>
        </form>
      </details>

      <details className="card recurring-panel">
        <summary>Recurring expenses <span className="muted small">{prefs.recurringItems?.length ?? 0}</span></summary>
        {(prefs.recurringItems ?? []).length > 0 && <ul className="recurring-list">
          {(prefs.recurringItems ?? []).map((item) => <li key={item.id}>
            <span><strong>{item.name}</strong><span className="muted small">{item.category} · {money(item.amount)} · {item.cadence === 'interval' ? `every ${item.intervalDays} days` : `monthly on day ${item.dayOfMonth}`}</span></span>
            <button className="ghost" aria-label={`Remove ${item.name}`} onClick={() => onRecurringUpdate((prefs.recurringItems ?? []).filter((entry) => entry.id !== item.id))}>×</button>
          </li>)}
        </ul>}
        <form className="stack recurring-form" onSubmit={addRecurring}>
          <label className="field"><span>Name</span><input value={recurringName} onChange={(e) => setRecurringName(e.target.value)} placeholder="Rent, internet, etc." maxLength={40} /></label>
          <label className="field"><span>Amount</span><input inputMode="decimal" type="number" min="0.01" step="0.01" value={recurringAmount} onChange={(e) => setRecurringAmount(e.target.value)} placeholder="0.00" /></label>
          <label className="field"><span>Category</span><select value={recurringCategory} onChange={(e) => setRecurringCategory(e.target.value)}>{prefs.categories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label className="field"><span>Schedule</span><select value={recurringCadence} onChange={(e) => setRecurringCadence(e.target.value as 'interval' | 'monthly')}><option value="interval">Every few days</option><option value="monthly">Monthly</option></select></label>
          {recurringCadence === 'interval'
            ? <label className="field"><span>Every how many days?</span><input type="number" min="1" max="365" value={recurringInterval} onChange={(e) => setRecurringInterval(e.target.value)} /></label>
            : <label className="field"><span>Day of month</span><input type="number" min="1" max="31" value={recurringDay} onChange={(e) => setRecurringDay(e.target.value)} /></label>}
          <button className="primary" type="submit" disabled={!recurringName.trim() || !(Number(recurringAmount) > 0)}>Add recurring expense</button>
        </form>
      </details>

      <section className="card list">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="muted">Nothing logged yet. Your first expense will show up here.</p>
        ) : (
          <ul>
            {recent.map((e) => (
              <li key={e.id}>
                <div>
                  <button className="expense-open" onClick={() => openExpense(e)}><strong>{e.category}</strong></button>
                  <span className="muted">{e.note ? ` ${e.note}` : ''}</span>
                  {e.excluded && <span className="excluded-label">Outside budget</span>}
                  <div className="muted small">{e.date === today ? 'Today' : e.date}</div>
                </div>
                <div className="row-end">
                  <span>{money(e.amount + (e.fee ?? 0))}</span>
                  <button className="ghost" aria-label={`Delete ${e.category} expense`} onClick={() => onDelete(e.id)}>×</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {paydayOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPaydayOpen(false) }}>
          <section className="sheet card" role="dialog" aria-modal="true" aria-labelledby="payday-title">
            <h2 className="h2" id="payday-title">Change next payday</h2>
            <label className="field"><span>Next payday</span><input type="date" min={today} value={paydayDraft} onChange={(e) => setPaydayDraft(e.target.value)} /></label>
            <button className="primary" disabled={paydayDraft <= today} onClick={() => { onPayday(paydayDraft); setPaydayOpen(false) }}>Save payday</button>
            <button className="link" onClick={() => setPaydayOpen(false)}>Cancel</button>
          </section>
        </div>
      )}

      {weightsOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setWeightsOpen(false) }}>
          <section className="sheet card stack" role="dialog" aria-modal="true" aria-labelledby="day-weight-title">
            <h2 className="h2" id="day-weight-title">Daily weights</h2>
            <p className="muted small">Weights change how your remaining budget is divided. Unchanged days have weight 1.</p>
            <div className="weight-calendar">
              {calendarDays.map((date) => {
                const weight = prefs.dayWeights?.[date] ?? 1
                return <label className="weight-day" key={date}>
                  <span>{date === today ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <select aria-label={`Weight for ${date}`} value={weight} onChange={(e) => setDayWeight(date, Number(e.target.value))}>
                    <option value={1}>Normal</option><option value={1.5}>Heavier · 1.5×</option><option value={0.5}>Lighter · 0.5×</option>
                  </select>
                </label>
              })}
            </div>
            <button className="primary" onClick={() => setWeightsOpen(false)}>Done</button>
          </section>
        </div>
      )}

      {editing && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null) }}>
          <form className="sheet card stack" role="dialog" aria-modal="true" aria-labelledby="edit-expense-title" onSubmit={saveExpense}>
            <h2 className="h2" id="edit-expense-title">Edit expense</h2>
            <label className="field"><span>Amount</span><input autoFocus inputMode="decimal" type="number" min="0.01" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></label>
            <CategoryPicker prefs={prefs} onPrefs={onPrefs} counts={counts} value={editCategory} onChange={setEditCategory} onRenameCategory={onRenameCategory} onDeleteCategory={onDeleteCategory} />
            <input className="note" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note (optional)" />
            <input aria-label="Tags (comma separated)" value={editTagsText} onChange={(e) => setEditTagsText(e.target.value)} placeholder="Tags (optional, comma separated)" />
            <label className="field"><span>Receipt photo (private, JPEG up to 1280px)</span><input type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              void compressReceipt(file).then((blob) => {
                const reader = new FileReader()
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    setEditReceipt({ blob, dataUrl: reader.result })
                    setReceiptPreview(reader.result)
                    setReceiptError('')
                  }
                }
                reader.onerror = () => setReceiptError('Unable to prepare this receipt for offline use.')
                reader.readAsDataURL(blob)
              }).catch((error: unknown) => setReceiptError(error instanceof Error ? error.message : 'Unable to process this receipt.'))
            }} /></label>
            {receiptPreview && <img className="receipt-thumb" src={receiptPreview} alt="Receipt thumbnail" />}
            {receiptError && <p className="bad small" role="alert">{receiptError}</p>}
            <label className="field"><span>Date</span><input type="date" min={cycle.startDate} max={today} value={editDate} onChange={(e) => setEditDate(e.target.value)} /></label>
            <label className="toggle"><input type="checkbox" checked={editExcluded} onChange={(e) => setEditExcluded(e.target.checked)} /><span>Outside budget / reimbursable</span></label>
            <label className="field"><span>Transfer fee (optional)</span><input inputMode="decimal" type="number" min="0" step="0.01" value={editFee} onChange={(e) => setEditFee(e.target.value)} placeholder="0.00" /></label>
            <button className="primary" type="submit" disabled={!(Number(editAmount) > 0)}>Save changes</button>
            <button className="danger-link" type="button" onClick={() => { onDelete(editing.id); setEditing(null) }}>Delete expense</button>
            <button className="link" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </form>
        </div>
      )}

      <button className="link" onClick={() => window.confirm('Start a new cycle? This closes the current one.') && onNewCycle()}>
        Got paid? Start a new cycle
      </button>
    </main>
  )
}

function initialState(): AppState {
  const read = <T,>(k: string, f: T): T => {
    try {
      const r = localStorage.getItem(k)
      return r ? (JSON.parse(r) as T) : f
    } catch {
      return f
    }
  }
  // Pick up data saved by the earlier stages
  const old = read<Cycle | null>('paycycle.cycle', null)
  const expenses = read<Expense[]>('paycycle.expenses', [])
  return { cycles: old ? [old] : [], expenses, prefs: read<Prefs>('paycycle.prefs', DEFAULT_PREFS), updatedAt: old || expenses.length ? Date.now() : 0 }
}

type Tab = 'today' | 'search' | 'history' | 'insights' | 'account'

export default function App() {
  const [state, setState] = usePersistentState<AppState>('paycycle.state', initialState(), migrateState)
  const [tab, setTab] = useState<Tab>('today')
  const [openId, setOpenId] = useState<string | null>(null)
  const [hasPin, setHasPin] = useState(pinIsConfigured)
  const [locked, setLocked] = useState(pinIsConfigured)
  const [pinEntry, setPinEntry] = useState('')
  const [pinError, setPinError] = useState('')
  const [recap, setRecap] = useState<{ spent: number; allowance: number; rolled: number } | null>(null)
  const [reminderSetupError, setReminderSetupError] = useState('')
  const { session, status } = useSync(state, setState)

  const mutate = (fn: (s: AppState) => Partial<AppState>) => setState((s) => {
    const changes = fn(s)
    const updatedAt = Date.now()
    const next = { ...s, ...changes, updatedAt }
    const versionRecords = <T extends { id: string; updatedAt?: number }>(records: T[], previous: T[]) => records.map((record) => {
      const old = previous.find((item) => item.id === record.id)
      const currentData = JSON.stringify({ ...record, updatedAt: undefined })
      const previousData = old ? JSON.stringify({ ...old, updatedAt: undefined }) : null
      return !old || currentData !== previousData
        ? { ...record, updatedAt }
        : { ...record, updatedAt: old.updatedAt ?? updatedAt }
    })
    return {
      ...next,
      cycles: versionRecords(next.cycles, s.cycles),
      expenses: versionRecords(next.expenses, s.expenses),
      prefsUpdatedAt: changes.prefs && changes.prefs !== s.prefs ? updatedAt : s.prefsUpdatedAt ?? s.updatedAt,
    }
  })
  const current = state.cycles.find((c) => !c.endedOn && !c.deleted) ?? null
  const opened = state.cycles.find((c) => c.id === openId && !c.deleted)

  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const expenseRows = state.expenses.filter((expense) => !expense.deleted).map((expense) => ({
      Date: expense.date,
      Category: expense.category,
      Tags: (expense.tags ?? []).join(', '),
      Amount: expense.amount,
      Fee: expense.fee ?? 0,
      Note: expense.note,
      Cycle: state.cycles.find((cycle) => cycle.id === expense.cycleId)?.startDate ?? expense.cycleId,
    }))
    const cycleRows = state.cycles.filter((cycle) => !cycle.deleted).map((cycle) => ({
      Start: cycle.startDate,
      Payday: cycle.nextPayday,
      Closed: cycle.endedOn ?? '',
      Income: cycleIncome(cycle),
      IncomeSources: (cycle.incomeSources ?? [{ label: 'Income', amount: cycle.income }]).map((source) => `${source.label}: ${source.amount}`).join('; '),
      FixedBills: cycle.fixedBills,
      Savings: cycle.savings,
      Spent: state.expenses.filter((expense) => expense.cycleId === cycle.id && !expense.deleted && !expense.excluded).reduce((sum, expense) => sum + expense.amount + (expense.fee ?? 0), 0),
    }))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenseRows), 'Expenses')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cycleRows), 'Cycle summaries')
    XLSX.writeFile(workbook, `paycycle-export-${toISO(new Date())}.xlsx`)
  }

  useEffect(() => {
    if (!current) return
    const today = toISO(new Date())
    const yesterdayDate = new Date(`${today}T00:00:00`)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = toISO(yesterdayDate)
    const lastOpened = localStorage.getItem('paycycle.last-opened-date')
    if (lastOpened === yesterday && yesterday >= current.startDate) {
      const previousSummary = summarise(current, state.expenses.filter((expense) => expense.date <= yesterday), yesterday, {
        dayWeights: state.prefs.dayWeights,
        plannedExpenses: state.prefs.plannedExpenses,
      })
      setRecap({ spent: previousSummary.spentToday, allowance: previousSummary.allowance, rolled: previousSummary.remainingToday })
    }
    localStorage.setItem('paycycle.last-opened-date', today)
  }, [current?.id])

  useEffect(() => {
    const schedule = state.prefs.morningReminder
    if (!('serviceWorker' in navigator)) return
    let timer: number | undefined
    let cancelled = false
    if (!current || !schedule?.enabled || !('Notification' in window) || Notification.permission !== 'granted') {
      void navigator.serviceWorker.getRegistration('/reminder/').then(async (registration) => {
        if (!registration) return
        registration.active?.postMessage({ type: 'SET_DAILY_REMINDER', reminder: { enabled: false } })
        const periodic = registration as ServiceWorkerRegistration & { periodicSync?: { unregister?: (tag: string) => Promise<void> } }
        await periodic.periodicSync?.unregister?.('paycycle-daily-reminder')
      }).catch((error: unknown) => setReminderSetupError(error instanceof Error ? error.message : 'Unable to disable the reminder.'))
      return
    }
    const allowance = summarise(current, state.expenses, toISO(new Date()), {
      dayWeights: state.prefs.dayWeights,
      plannedExpenses: state.prefs.plannedExpenses,
    }).allowance * (1 - Math.min(0.5, Math.max(0, state.prefs.comfortBuffer ?? 0.1)))
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/reminder/sw.js', { scope: '/reminder/' })
        const reminder = { enabled: true, time: schedule.time, allowance: money(Math.max(0, allowance)) }
        ;(registration.active ?? registration.installing)?.postMessage({ type: 'SET_DAILY_REMINDER', reminder })
        const periodic = registration as ServiceWorkerRegistration & {
          periodicSync?: {
            register: (tag: string, options: { minInterval: number }) => Promise<void>
            unregister?: (tag: string) => Promise<void>
          }
        }
        if (periodic.periodicSync) {
          await periodic.periodicSync.register('paycycle-daily-reminder', { minInterval: 24 * 60 * 60 * 1000 })
        } else {
          const [hour, minute] = schedule.time.split(':').map(Number)
          const next = new Date()
          next.setHours(hour, minute, 0, 0)
          if (next <= new Date()) next.setDate(next.getDate() + 1)
          timer = window.setTimeout(() => {
            if (!cancelled) void registration.showNotification('Paycycle', { body: `Today's comfortable amount: ${reminder.allowance}`, icon: '/icon-192.png' })
          }, next.getTime() - Date.now())
        }
        setReminderSetupError('')
      } catch (error) {
        setReminderSetupError(error instanceof Error ? error.message : 'Unable to schedule the reminder.')
      }
    })()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [current?.id, state.prefs.morningReminder, state.prefs.dayWeights, state.prefs.plannedExpenses, state.prefs.comfortBuffer, state.expenses])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add-expense') !== '1') return
    setTab('today')
    const timeout = window.setTimeout(() => {
      const field = document.querySelector<HTMLInputElement>('input.amount')
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field?.focus()
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hasPin && hiddenAt !== null && Date.now() - hiddenAt >= 60_000) {
        setLocked(true)
        setPinEntry('')
        setPinError('')
        hiddenAt = null
      } else if (document.visibilityState === 'visible') hiddenAt = null
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [hasPin])

  useEffect(() => {
    if (!current) return
    const items = state.prefs.recurringItems ?? []
    if (!advanceRecurring(items, toISO(new Date())).occurrences.length) return
    setState((previous) => {
      const today = toISO(new Date())
      const advanced = advanceRecurring(previous.prefs.recurringItems ?? [], today)
      if (!advanced.occurrences.length) return previous
      const existingIds = new Set(previous.expenses.map((expense) => expense.id))
      const now = Date.now()
      const additions: Expense[] = advanced.occurrences.flatMap(({ recurringId, date }) => {
        const recurring = (previous.prefs.recurringItems ?? []).find((item) => item.id === recurringId)
        const id = `recurring:${recurringId}:${date}`
        if (!recurring || date < current.startDate || existingIds.has(id)) return []
        return [{ id, cycleId: current.id, amount: recurring.amount, category: recurring.category, note: recurring.name, date, createdAt: now, updatedAt: now }]
      })
      return {
        ...previous,
        prefs: { ...previous.prefs, recurringItems: advanced.items },
        prefsUpdatedAt: now,
        expenses: [...previous.expenses, ...additions],
        updatedAt: now,
      }
    })
  }, [current?.id, state.prefs.recurringItems, state.expenses])

  const closeCycle = () => {
    if (!current) return
    mutate((s) => ({ cycles: s.cycles.map((c) => (c.id === current.id ? { ...c, endedOn: toISO(new Date()) } : c)) }))
    setOpenId(current.id)
    setTab('history')
  }

  let view
  if (tab === 'account') {
    view = <Account session={session} status={status} state={state} onImport={(s) => setState(migrateState({ ...s, updatedAt: Date.now() }))} hasPin={hasPin} onPinChange={(enabled) => { setHasPin(enabled); setLocked(false) }} onPrefs={(prefs) => mutate(() => ({ prefs }))} onExportXlsx={exportXlsx} />
  } else if (tab === 'search') {
    view = <Search cycles={state.cycles} expenses={state.expenses} />
  } else if (tab === 'insights') {
    view = <Insights cycles={state.cycles} expenses={state.expenses} />
  } else if (tab === 'history') {
    view = opened ? (
      <Report cycle={opened} cycles={state.cycles} expenses={state.expenses} onBack={() => setOpenId(null)} />
    ) : (
      <History cycles={state.cycles.filter((c) => !c.deleted)} expenses={state.expenses} onOpen={setOpenId} />
    )
  } else if (!current) {
    view = <Setup previous={[...state.cycles].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null} expenses={state.expenses} onStart={(c) => mutate((s) => ({ cycles: [...s.cycles, c] }))} />
  } else {
    view = (
      <Home
        cycle={current}
        expenses={state.expenses}
        onAdd={(e) => mutate((s) => ({ expenses: [...s.expenses, e] }))}
        onEdit={(expense) => mutate((s) => ({ expenses: s.expenses.map((e) => e.id === expense.id ? expense : e) }))}
        onDelete={(id) => mutate((s) => ({ expenses: s.expenses.map((e) => e.id === id ? { ...e, deleted: true } : e) }))}
        onReceipt={async (expenseId, blob, dataUrl) => {
          await cacheReceipt(expenseId, dataUrl)
          if (!session || !supabase || !navigator.onLine) return undefined
          const path = `${session.user.id}/${expenseId}.jpg`
          const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (error) throw new Error(`Receipt upload failed: ${error.message}`)
          return path
        }}
        onLoadReceipt={async (expense) => {
          if (!supabase || !session || !expense.receiptPath) return undefined
          const { data, error } = await supabase.storage.from('receipts').createSignedUrl(expense.receiptPath, 60)
          if (error) throw new Error(`Receipt download failed: ${error.message}`)
          const response = await fetch(data.signedUrl)
          if (!response.ok) throw new Error(`Receipt download failed with HTTP ${response.status}.`)
          const blob = await response.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read the downloaded receipt.'))
            reader.onerror = () => reject(new Error('Unable to read the downloaded receipt.'))
            reader.readAsDataURL(blob)
          })
          await cacheReceipt(expense.id, dataUrl)
          return dataUrl
        }}
        onPayday={(date) => mutate((s) => ({ cycles: s.cycles.map((c) => c.id === current.id ? { ...c, nextPayday: date } : c) }))}
        onRecurringUpdate={(items) => mutate((s) => ({ prefs: { ...s.prefs, recurringItems: items } }))}
        onNewCycle={closeCycle}
        onRenameCategory={(category, nextName) => mutate((s) => ({
          expenses: s.expenses.map((expense) => expense.category === category ? { ...expense, category: nextName } : expense),
          prefs: {
            ...s.prefs,
            categories: s.prefs.categories.map((entry) => entry === category ? nextName : entry),
            favorites: [...new Set(s.prefs.favorites.map((entry) => entry === category ? nextName : entry))],
            dismissed: [...new Set(s.prefs.dismissed.map((entry) => entry === category ? nextName : entry))],
            categoryLimits: s.prefs.categoryLimits ? Object.fromEntries(Object.entries(s.prefs.categoryLimits).map(([entry, limit]) => [entry === category ? nextName : entry, limit])) : undefined,
            recurringItems: s.prefs.recurringItems?.map((item) => item.category === category ? { ...item, category: nextName } : item),
          },
        }))}
        onDeleteCategory={(category) => mutate((s) => {
          const fallback = s.prefs.categories.find((entry) => entry !== category) ?? 'Other'
          return {
            expenses: s.expenses.map((expense) => expense.category === category ? { ...expense, category: fallback } : expense),
            prefs: {
              ...s.prefs,
              categories: s.prefs.categories.filter((entry) => entry !== category),
              favorites: s.prefs.favorites.filter((entry) => entry !== category),
              dismissed: s.prefs.dismissed.filter((entry) => entry !== category),
              categoryLimits: Object.fromEntries(Object.entries(s.prefs.categoryLimits ?? {}).filter(([entry]) => entry !== category)),
              recurringItems: s.prefs.recurringItems?.map((item) => item.category === category ? { ...item, category: fallback } : item),
            },
          }
        })}
        recap={recap}
        onDismissRecap={() => setRecap(null)}
        reminderSetupError={reminderSetupError}
        prefs={state.prefs}
        onPrefs={(p) => mutate(() => ({ prefs: p }))}
      />
    )
  }

  if (locked && hasPin) {
    return <main className="screen lock-screen">
      <h1 className="title">Paycycle is locked</h1>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void verifyPin(pinEntry).then((valid) => {
        if (valid) { setLocked(false); setPinEntry(''); setPinError('') }
        else setPinError('That PIN is not correct.')
      }) }}>
        <label className="field"><span>PIN</span><input autoFocus inputMode="numeric" type="password" pattern="[0-9]*" maxLength={6} value={pinEntry} onChange={(e) => setPinEntry(e.target.value)} autoComplete="current-password" /></label>
        {pinError && <p className="bad small" role="alert">{pinError}</p>}
        <button className="primary" type="submit" disabled={!/^\d{4,6}$/.test(pinEntry)}>Unlock</button>
      </form>
    </main>
  }

  return (
    <>
      {view}
      <nav className="tabs" aria-label="Main">
        {(['today', 'search', 'history', 'insights', 'account'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setOpenId(null) }}>
            {t === 'today' ? <span className="tab-label">Today<span className={`sync-dot ${status === 'synced' ? 'synced' : status === 'syncing' ? 'syncing' : status === 'offline' ? 'offline' : 'local'}`} role="img" aria-label={`Sync ${status === 'off' ? 'local only' : status === 'signed-out' ? 'signed out' : status}`} title={`Sync: ${status === 'off' ? 'local only' : status}`} /></span> : t === 'history' ? 'History' : t === 'search' ? 'Search' : t === 'insights' ? 'Insights' : 'Account'}
          </button>
        ))}
      </nav>
    </>
  )
}
