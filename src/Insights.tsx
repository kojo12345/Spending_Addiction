import { cycleIncome } from './types'
import { money, sumOf, toISO } from './logic'
import type { Cycle, Expense } from './types'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Insights({ cycles, expenses }: { cycles: Cycle[]; expenses: Expense[] }) {
  const weekdayTotals = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }))
  for (const cycle of cycles) {
    const end = cycle.endedOn ?? toISO(new Date())
    const date = new Date(`${cycle.startDate}T00:00:00`)
    while (toISO(date) <= end) {
      const iso = toISO(date)
      const spent = expenses.filter((expense) => expense.cycleId === cycle.id && expense.date === iso && !expense.excluded && !expense.deleted).reduce((total, expense) => total + expense.amount + (expense.fee ?? 0), 0)
      weekdayTotals[date.getDay()].total += spent
      weekdayTotals[date.getDay()].days += 1
      date.setDate(date.getDate() + 1)
    }
  }
  const latest = [...cycles].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 3)
  const topCategories = new Map<string, number>()
  expenses.filter((expense) => latest.some((cycle) => cycle.id === expense.cycleId) && !expense.excluded && !expense.deleted).forEach((expense) => {
    topCategories.set(expense.category, (topCategories.get(expense.category) ?? 0) + expense.amount + (expense.fee ?? 0))
  })
  const categories = [...topCategories].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const closed = [...cycles].filter((cycle) => cycle.endedOn).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const values = closed.map((cycle) => ({ label: cycle.startDate.slice(0, 7), spent: sumOf(expenses.filter((expense) => expense.cycleId === cycle.id)), budget: cycleIncome(cycle) - cycle.fixedBills - cycle.savings }))
  const width = 360
  const height = 160
  const max = Math.max(1, ...values.map((value) => value.spent))
  const points = values.map((value, index) => `${values.length < 2 ? width / 2 : 20 + index * (width - 40) / (values.length - 1)},${height - 20 - value.spent / max * (height - 40)}`).join(' ')

  return <main className="screen">
    <h1 className="title">Insights</h1>
    <section className="card">
      <h2 className="h2">Average spend by weekday</h2>
      {weekdayTotals.map(({ total, days }, index) => <div className="catline" key={weekdays[index]}><span>{weekdays[index]}</span><strong>{money(days ? total / days : 0)}</strong></div>)}
    </section>
    <section className="card">
      <h2 className="h2">Top categories · last 3 cycles</h2>
      {categories.length ? categories.map(([category, amount]) => <div className="catline" key={category}><span>{category}</span><strong>{money(amount)}</strong></div>) : <p className="muted">No spending data yet.</p>}
    </section>
    <section className="card">
      <h2 className="h2">Total spent per closed cycle</h2>
      {values.length === 0 ? <p className="muted">Closed cycles will appear here.</p> : <div className="insight-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart of spending per closed cycle">
          <line x1="20" y1={height - 20} x2={width - 20} y2={height - 20} className="chart-axis" />
          <polyline points={points} className="chart-line" />
          {values.map((value, index) => {
            const x = values.length < 2 ? width / 2 : 20 + index * (width - 40) / (values.length - 1)
            const y = height - 20 - value.spent / max * (height - 40)
            return <g key={`${value.label}-${index}`}><circle cx={x} cy={y} r="4" className="chart-point" /><text x={x} y={height - 3} textAnchor="middle">{value.label}</text></g>
          })}
        </svg>
        <ul className="insight-cycle-list">{values.map((value, index) => <li key={`${value.label}-${index}`}><span>{value.label}</span><strong>{money(value.spent)}</strong></li>)}</ul>
      </div>}
    </section>
  </main>
}
