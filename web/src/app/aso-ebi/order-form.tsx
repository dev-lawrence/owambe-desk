'use client'

import {formatNaira} from '@owambe/shared'
import {useActionState} from 'react'

import {type OrderFormState, placeOrder} from './actions'

export type LotOption = {_id: string; label: string; unit: string; price: string; hex: string | null; remaining: number}

export function OrderForm({lots}: {lots: LotOption[]}) {
  const [state, action, pending] = useActionState<OrderFormState, FormData>(placeOrder, {})

  return (
    <form action={action} className="mt-10 grid max-w-2xl gap-8">
      <fieldset className="grid gap-3">
        <legend className="text-lg font-semibold">Choose your fabric</legend>
        {lots.map((lot, index) => (
          <label
            key={lot._id}
            className="flex cursor-pointer items-center gap-4 rounded-md border border-line p-4 has-[:checked]:border-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
          >
            <input type="radio" name="lotId" value={lot._id} defaultChecked={index === 0} disabled={lot.remaining < 1} className="accent-accent" required />
            <span aria-hidden="true" className="size-10 shrink-0 rounded-sm border border-line" style={{backgroundColor: lot.hex ?? undefined}} />
            <span className="grow">
              <span className="block font-medium">{lot.label}</span>
              <span className="block text-sm text-ink-soft">{lot.unit}</span>
            </span>
            <span className="tabular text-right font-medium">
              {formatNaira(lot.price)}
              <span className="block text-sm font-normal text-ink-soft">{lot.remaining > 0 ? `${lot.remaining} left` : 'Sold out'}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="font-medium">Your invite code</span>
          <input
            name="inviteCode"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            minLength={6}
            maxLength={6}
            placeholder="e.g. kzfr2r"
            className="tabular rounded-md border border-line bg-paper px-3 py-2.5 text-lg tracking-widest"
          />
          <span className="text-sm text-ink-soft">The six letters and numbers on your invite.</span>
        </label>
        <label className="grid gap-2">
          <span className="font-medium">How many</span>
          <select name="quantity" defaultValue="1" className="tabular rounded-md border border-line bg-paper px-3 py-2.5 text-lg">
            {Array.from({length: 10}, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-sm text-ink-soft">Many guests buy for a spouse or mother too.</span>
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-line p-4">
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-5 py-3 font-medium text-accent-ink transition-opacity disabled:opacity-60"
        >
          {pending ? 'Opening checkout…' : 'Continue to payment'}
        </button>
        <p className="mt-3 text-sm text-ink-soft">
          You pay on Bachs, by card or bank transfer. The total is worked out on our side from the price above.
        </p>
      </div>
    </form>
  )
}
