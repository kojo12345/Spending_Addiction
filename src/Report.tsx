import { daysBetween, money, sumOf, toISO } from './logic'
import { cycleIncome } from './types'
import type { Cycle, Expense } from './types'

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const cycleLabel = (c: Cycle) => `${fmtDate(c.startDate)} to ${fmtDate(c.endedOn ?? c.nextPayday)}`

export default function Report({ cycle, cycles, expenses, onBack }: { cycle: Cycle; cycles: Cycle[]; expenses: Expense[]; onBack: () => void }) {
  const today = toISO(new Date())
  const end = cycle.endedOn ?? today
  const allMine = expenses.filter((e) => e.cycleId === cycle.id && !e.deleted)
  const mine = allMine.filter((e) => !e.excluded)
  const excluded = allMine.filter((e) => e.excluded)
  const spent = sumOf(mine)
  const excludedTotal = excluded.reduce((total, expense) => total + expense.amount + (expense.fee ?? 0), 0)
  const spendable = cycleIncome(cycle) - cycle.fixedBills - cycle.savings
  const days = Math.max(1, daysBetween(cycle.startDate, end) + 1)
  const baseline = spendable / Math.max(1, daysBetween(cycle.startDate, cycle.nextPayday))

  const categoryTotals = mine.reduce<Record<string, number>>((totals, e) => {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount
    if (e.fee) totals.Fees = (totals.Fees ?? 0) + e.fee
    return totals
  }, {})
  const cats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])
  const tagTotals = mine.reduce<Record<string, number>>((totals, expense) => {
    for (const tag of expense.tags ?? []) totals[tag] = (totals[tag] ?? 0) + expense.amount
    return totals
  }, {})
  const tags = Object.entries(tagTotals).sort((a, b) => b[1] - a[1])

  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(cycle.startDate + 'T00:00:00')
    d.setDate(d.getDate() + i)
    const iso = toISO(d)
    return sumOf(mine.filter((e) => e.date === iso))
  })
  const max = Math.max(baseline, ...daily, 1)
  const overDays = daily.filter((d) => d > baseline).length

  const prev = cycles[cycles.findIndex((c) => c.id === cycle.id) - 1]
  const prevSpent = prev ? sumOf(expenses.filter((e) => e.cycleId === prev.id)) : 0
  const diff = prev && prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null
  const left = spendable - spent
  const carriedOver = cycle.carriedOver ?? 0

  return (
    <main className="screen">
      <div className="report-actions">
        <button className="link back" onClick={onBack}>Back to history</button>
        <button className="primary print-button" onClick={() => window.print()}>Export PDF</button>
      </div>
      <h1 className="title">{cycleLabel(cycle)}</h1>
      <section className="stats">
        <div className="card stat"><span className="muted">Spent</span><strong>{money(spent)}</strong></div>
        <div className="card stat"><span className="muted">{left >= 0 ? 'Left over' : 'Overspent'}</span><strong className={left < 0 ? 'bad' : 'good'}>{money(Math.abs(left))}</strong></div>
        <div className="card stat"><span className="muted">Income</span><strong>{money(cycleIncome(cycle))}</strong></div>
        <div className="card stat"><span className="muted">Average a day</span><strong>{money(spent / days)}</strong></div>
      </section>
      {cycle.incomeSources && <section className="card">
        <h2 className="h2">Income sources</h2>
        {cycle.incomeSources.map((source, index) => <div className="catline" key={`${source.label}-${index}`}><span>{source.label}</span><strong>{money(source.amount)}</strong></div>)}
      </section>}
      {tags.length > 0 && <section className="card">
        <h2 className="h2">Spending by tag</h2>
        {tags.map(([tag, amount]) => <div className="catline" key={tag}><span>#{tag}</span><strong>{money(amount)}</strong></div>)}
      </section>}
      <p className="card note-card">
        {carriedOver > 0 && <>Carried over into this cycle: <strong>{money(carriedOver)}</strong><br /></>}
        Excluded expenses: <strong>{money(excludedTotal)}</strong> (not counted in your budget totals).
      </p>
      {diff !== null && (
        <p className="card note-card">
          {Math.abs(diff) < 1 ? 'Same spending as' : `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'more' : 'less'} than`} the previous cycle ({money(prevSpent)}).
        </p>
      )}
      <section className="card">
        <h2 className="h2">Spending by category</h2>
        {cats.length === 0 ? <p className="muted">No expenses in this cycle.</p> : cats.map(([c, v]) => (
          <div className="catrow" key={c}>
            <div className="catline"><span>{c}</span><span>{money(v)} <span className="muted">{((v / spent) * 100).toFixed(0)}%</span></span></div>
            <div className="track"><span style={{ width: `${(v / cats[0][1]) * 100}%` }} /></div>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="h2">Daily spending</h2>
        <p className="muted small">{overDays === 0 ? 'No days over' : `${overDays} day${overDays > 1 ? 's' : ''} over`} the {money(baseline)} daily average. The dashed line marks it.</p>
        <div className="daily" role="img" aria-label="Daily spending bars">
          <i className="line" style={{ bottom: `${(baseline / max) * 100}%` }} />
          {daily.map((d, i) => <span key={i} className={d > baseline ? 'hi' : ''} style={{ height: `${(d / max) * 100}%` }} />)}
        </div>
      </section>
      {mine.length > 0 && (
        <section className="card list">
          <h2>Biggest expenses</h2>
          <ul>
            {[...mine].sort((a, b) => (b.amount + (b.fee ?? 0)) - (a.amount + (a.fee ?? 0))).slice(0, 5).map((e) => (
              <li key={e.id}><div><strong>{e.category}</strong><span className="muted">{e.note ? ` ${e.note}` : ''}</span><div className="muted small">{fmtDate(e.date)}</div></div><strong>{money(e.amount + (e.fee ?? 0))}</strong></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
