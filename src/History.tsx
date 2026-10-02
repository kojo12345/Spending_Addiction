import { money, sumOf } from './logic'
import { cycleLabel } from './Report'
import type { Cycle, Expense } from './types'

export default function History({ cycles, expenses, onOpen }: { cycles: Cycle[]; expenses: Expense[]; onOpen: (id: string) => void }) {
  return (
    <main className="screen">
      <h1 className="title">History</h1>
      {cycles.length === 0 ? (
        <p className="muted">Closed cycles and their reports will show up here.</p>
      ) : (
        [...cycles].reverse().map((c) => (
          <button key={c.id} className="card cyc" onClick={() => onOpen(c.id)}>
            <div>
              <strong>{cycleLabel(c)}</strong>
              <div className="muted small">{c.endedOn ? 'Closed' : 'Current, so far'}</div>
            </div>
            <strong>{money(sumOf(expenses.filter((e) => e.cycleId === c.id)))}</strong>
          </button>
        ))
      )}
    </main>
  )
}
