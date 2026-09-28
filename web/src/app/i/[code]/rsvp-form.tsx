'use client'

import {useActionState} from 'react'

import {reply, type RsvpState} from './actions'

export function RsvpForm({code, current}: {code: string; current: string | null}) {
  const [state, action, pending] = useActionState<RsvpState, FormData>(reply, {})
  const answer = state.saved ?? current

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="code" value={code} />
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">Will you come?</legend>
        {[
          {value: 'attending', label: 'Yes, I’ll be there'},
          {value: 'declined', label: 'Sorry, I can’t make it'},
        ].map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-4 has-[:checked]:border-accent">
            <input type="radio" name="rsvp" value={option.value} defaultChecked={answer === option.value} className="accent-accent" required />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-md bg-accent px-5 py-3 font-medium text-accent-ink disabled:opacity-60">
          {pending ? 'Sending…' : 'Send reply'}
        </button>
        <p role="status" className="text-ink-soft">
          {state.error ?? (state.saved === 'attending' ? 'Thank you. We’ve counted your plate.' : state.saved === 'declined' ? 'Thank you for letting us know.' : '')}
        </p>
      </div>
    </form>
  )
}
