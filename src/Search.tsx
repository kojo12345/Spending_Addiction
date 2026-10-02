import { useMemo, useState } from 'react'
import { money } from './logic'
import type { Cycle, Expense } from './types'

export default function Search({ cycles, expenses }: { cycles: Cycle[]; expenses: Expense[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minimum, setMinimum] = useState('')
  const [maximum, setMaximum] = useState('')
  const categories = [...new Set(expenses.filter((expense) => !expense.deleted).map((expense) => expense.category))].sort()
  const tags = [...new Set(expenses.flatMap((expense) => expense.deleted ? [] : expense.tags ?? []))].sort()
  const cycleNames = new Map(cycles.map((cycle) => [cycle.id, `${cycle.startDate} – ${cycle.endedOn ?? cycle.nextPayday}`]))
  const filtered = useMemo(() => expenses.filter((expense) => {
    if (expense.deleted) return false
    const needle = query.trim().toLowerCase()
    if (needle && !`${expense.category} ${expense.note} ${(expense.tags ?? []).join(' ')}`.toLowerCase().includes(needle)) return false
    if (category && expense.category !== category) return false
    if (tag && !(expense.tags ?? []).includes(tag)) return false
    if (from && expense.date < from) return false
    if (to && expense.date > to) return false
    if (minimum && expense.amount < Number(minimum)) return false
    if (maximum && expense.amount > Number(maximum)) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), [expenses, query, category, tag, from, to, minimum, maximum, cycles])

  return <main className="screen">
    <h1 className="title">Search expenses</h1>
    <section className="card stack">
      <label className="field"><span>Search text</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Note, category, or tag" /></label>
      <label className="field"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Tag</span><select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All tags</option>{tags.map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="filter-pair"><label className="field"><span>From date</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="field"><span>To date</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
      <div className="filter-pair"><label className="field"><span>Minimum amount</span><input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></label><label className="field"><span>Maximum amount</span><input type="number" min="0" step="0.01" value={maximum} onChange={(e) => setMaximum(e.target.value)} /></label></div>
    </section>
    <section className="card list">
      <h2>{filtered.length} expense{filtered.length === 1 ? '' : 's'}</h2>
      {filtered.length === 0 ? <p className="muted">No expenses match these filters.</p> : <ul>{filtered.map((expense) => <li key={expense.id}>
        <div><strong>{expense.category}</strong><span className="muted">{expense.note ? ` · ${expense.note}` : ''}</span><div className="muted small">{expense.date} · {cycleNames.get(expense.cycleId) ?? 'Cycle unavailable'}</div>{expense.tags?.length ? <div className="muted small">{expense.tags.map((value) => `#${value}`).join(' ')}</div> : null}</div>
        <strong>{money(expense.amount + (expense.fee ?? 0))}</strong>
      </li>)}</ul>}
    </section>
  </main>
}
