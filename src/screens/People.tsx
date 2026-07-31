// PLAN.md §8 prerequisite — who's at the table.
import { useState } from 'react'
import { useBill } from '../store/bill'
import { PersonChip } from '../components/Chip'
import { Button } from '../components/Button'
import { AppBar } from '../components/Shell'
import { X } from '../components/icons'

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
    <div className="min-h-dvh">
      <AppBar right="home" className="hidden lg:flex" />
      <div className="mx-auto flex min-h-[calc(100dvh-0px)] max-w-md flex-col px-4 py-6 lg:min-h-0 lg:py-2">
        <h1 className="font-warm text-2xl">Who's splitting?</h1>
        <p className="mt-1 text-xs text-ink-faint">Add everyone at the table, including whoever paid.</p>

        <div className="mt-5 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Name"
            autoFocus
            className="min-h-11 flex-1 rounded-lg border border-rule bg-paper-raised px-3 text-sm"
          />
          <Button variant="primary" onClick={submit}>
            Add
          </Button>
        </div>

        <ul className="mt-5 divide-y divide-rule rounded-lg border border-rule bg-paper-raised">
          {bill.people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <PersonChip person={p} size="sm" />
              <span className="flex-1 text-sm">{p.name}</span>
              <button
                type="button"
                onClick={() => removePerson(p.id)}
                aria-label={`Remove ${p.name}`}
                className="pressable flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex gap-2 pt-6 lg:mt-8">
          <Button onClick={() => setStep('home')}>Back</Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={bill.people.length < 2}
            onClick={() => setStep('items')}
          >
            {bill.people.length < 2 ? 'Add at least 2 people' : `Continue with ${bill.people.length}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
