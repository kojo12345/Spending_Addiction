import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { rankFavorites, suggestion } from './categories'
import type { Prefs } from './categories'
import { DEFAULT_PREFS } from './categories'

interface Props {
  prefs: Prefs
  onPrefs: (p: Prefs) => void
  counts: Record<string, number>
  value: string
  onChange: (c: string) => void
  spentByCategory?: Record<string, number>
  onRenameCategory: (category: string, nextName: string) => void
  onDeleteCategory: (category: string) => void
}

export default function CategoryPicker({ prefs, onPrefs, counts, value, onChange, spentByCategory = {}, onRenameCategory, onDeleteCategory }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const favs = rankFavorites(prefs, counts)
  const visible = favs.includes(value) ? favs : [...favs, value]
  const suggested = suggestion(prefs, counts)

  const toggleFav = (c: string) =>
    onPrefs({
      ...prefs,
      favorites: prefs.favorites.includes(c) ? prefs.favorites.filter((x) => x !== c) : [...prefs.favorites, c],
    })

  const addCategory = () => {
    const name = draft.trim()
    if (!name) return
    const existing = prefs.categories.find((c) => c.toLowerCase() === name.toLowerCase())
    if (existing) onChange(existing)
    else {
      onPrefs({ ...prefs, categories: [...prefs.categories, name] })
      onChange(name)
    }
    setDraft('')
    setOpen(false)
  }

  const renameCategory = (category: string) => {
    const name = renameDraft.trim()
    if (!name) return
    const existing = prefs.categories.find((entry) => entry.toLowerCase() === name.toLowerCase())
    if (existing && existing !== category) {
      window.alert('A category with that name already exists.')
      return
    }
    if (DEFAULT_PREFS.categories.includes(category) && !window.confirm(`Rename default category "${category}" to "${name}"?`)) return
    onRenameCategory(category, name)
    if (value === category) onChange(name)
    setRenaming(null)
    setRenameDraft('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCategory()
    }
  }

  return (
    <div className="stack tight">
      {suggested && (
        <div className="suggest" role="status">
          <p>
            You've logged <strong>{suggested}</strong> {counts[suggested]} times this month. Add it to your quick buttons?
          </p>
          <div className="suggest-actions">
            <button type="button" className="mini" onClick={() => toggleFav(suggested)}>Add</button>
            <button type="button" className="mini quiet" onClick={() => onPrefs({ ...prefs, dismissed: [...prefs.dismissed, suggested] })}>
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="chips" role="group" aria-label="Category">
        {visible.map((c) => (
          <button key={c} type="button" className={`chip${c === value ? ' on' : ''}`} aria-pressed={c === value} onClick={() => onChange(c)}>
            {c}
          </button>
        ))}
        <button type="button" className="chip more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'More'}
        </button>
      </div>

      {open && (
        <div className="panel">
          <ul>
            {prefs.categories.map((c) => (
              <li key={c}>
                <div className="category-settings">
                    {renaming === c ? (
                      <div className="add-cat">
                        <input aria-label={`Rename ${c}`} value={renameDraft} maxLength={24} onChange={(e) => setRenameDraft(e.target.value)} />
                        <button type="button" className="mini" disabled={!renameDraft.trim()} onClick={() => renameCategory(c)}>Save</button>
                        <button type="button" className="mini quiet" onClick={() => setRenaming(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button type="button" className="cat-name" onClick={() => { onChange(c); setOpen(false) }}>{c}</button>
                        <div className="category-actions">
                          <button type="button" className="mini quiet" onClick={() => { setRenaming(c); setRenameDraft(c) }}>Rename</button>
                          {!DEFAULT_PREFS.categories.includes(c) && <button type="button" className="danger-link" onClick={() => {
                            if (window.confirm(`Delete "${c}" and move its expenses to another category?`)) {
                              onDeleteCategory(c)
                              if (value === c) onChange(prefs.categories.find((entry) => entry !== c) ?? 'Other')
                            }
                          }}>Delete</button>}
                        </div>
                      </>
                    )}
                    <label className="limit-setting"><span>Cycle limit</span><input aria-label={`${c} cycle spending limit`} type="number" min="0" step="0.01" placeholder="No limit" value={prefs.categoryLimits?.[c] ?? ''} onChange={(e) => {
                    const limits = { ...prefs.categoryLimits }
                    const value = Number(e.target.value)
                    if (e.target.value && value > 0) limits[c] = value
                    else delete limits[c]
                    onPrefs({ ...prefs, categoryLimits: limits })
                  }} /></label>
                  {(prefs.categoryLimits?.[c] ?? 0) > 0 && (() => {
                    const limit = prefs.categoryLimits?.[c] ?? 0
                    const spent = spentByCategory[c] ?? 0
                    const percent = (spent / limit) * 100
                    return <div className="limit-progress" aria-label={`${c}: ${percent.toFixed(0)} percent of limit used`}>
                      <div className="track"><span className={percent >= 100 ? 'limit-hit' : percent >= 80 ? 'limit-near' : ''} style={{ width: `${Math.min(100, percent)}%` }} /></div>
                      <span className={`small${percent >= 80 ? ' bad' : ' muted'}`}>{percent >= 100 ? 'Limit reached' : percent >= 80 ? 'Near limit' : `${Math.round(percent)}% used`}</span>
                    </div>
                  })()}
                </div>
                <button
                  type="button"
                  className={`star${prefs.favorites.includes(c) ? ' on' : ''}`}
                  aria-pressed={prefs.favorites.includes(c)}
                  aria-label={`${prefs.favorites.includes(c) ? 'Remove' : 'Add'} ${c} ${prefs.favorites.includes(c) ? 'from' : 'to'} quick buttons`}
                  onClick={() => toggleFav(c)}
                >
                  ★
                </button>
              </li>
            ))}
          </ul>
          <div className="add-cat">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder="New category" maxLength={24} />
            <button type="button" className="mini" onClick={addCategory} disabled={!draft.trim()}>Add</button>
          </div>
        </div>
      )}
    </div>
  )
}
