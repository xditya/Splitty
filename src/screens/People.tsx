// PLAN.md §8 prerequisite — who's at the table.
import { useState } from 'react'
import { useBill } from '../store/bill'
import { PersonChip } from '../components/Chip'

export function PeopleScreen() {
  const { bill, addPerson, removePerson, setStep } = useBill()
  const [name, setName] = useState('')

  const submit = () => {
    if (name.trim()) {
      addPerson(name)
      setName('')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <h1 className="font-warm text-2xl">Who's splitting?</h1>
      <p className="mt-1 text-xs text-ink-faint">Add everyone at the table, including whoever paid.</p>

      <div className="mt-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Name"
          autoFocus
          className="min-h-11 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm"
        />
        <button type="button" onClick={submit} className="pressable min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-paper">
          Add
        </button>
      </div>

      <ul className="mt-5 space-y-2">
        {bill.people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-md border border-rule bg-paper-raised px-3 py-2">
            <PersonChip person={p} size="sm" />
            <span className="flex-1 text-sm">{p.name}</span>
            <button
              type="button"
              onClick={() => removePerson(p.id)}
              aria-label={`Remove ${p.name}`}
              className="pressable min-h-11 min-w-11 text-ink-faint"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex gap-2 pt-6">
        <button type="button" onClick={() => setStep('home')} className="pressable rounded-md border border-rule px-4 py-2 text-sm">
          Back
        </button>
        <button
          type="button"
          disabled={bill.people.length < 2}
          onClick={() => setStep('items')}
          className="pressable flex-1 rounded-md bg-ink py-3 text-sm font-bold text-paper disabled:opacity-40"
        >
          {bill.people.length < 2 ? 'Add at least 2 people' : `Continue with ${bill.people.length}`}
        </button>
      </div>
    </div>
  )
}
