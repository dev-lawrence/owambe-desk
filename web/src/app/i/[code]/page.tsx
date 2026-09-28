import {INVITE_CODE_PATTERN} from '@owambe/shared'
import {INVITE_QUERY} from '@owambe/shared/queries'
import type {Metadata} from 'next'
import Link from 'next/link'
import {notFound} from 'next/navigation'

import {sanityFetch} from '@/sanity/live'

import {InviteMessage} from './invite-message'
import {RsvpForm} from './rsvp-form'

export const metadata: Metadata = {title: 'Your invite · Tolu & Emeka', robots: {index: false}}

export default async function InvitePage({params}: {params: Promise<{code: string}>}) {
  const {code} = await params
  if (!INVITE_CODE_PATTERN.test(code)) notFound()
  const {data: guest} = await sanityFetch({query: INVITE_QUERY, params: {code}, stega: false})
  if (!guest?.event) notFound()

  const firstName = guest.name?.split(' ')[0]

  return (
    <main className="mx-auto max-w-6xl px-5 pt-16 pb-24 sm:px-8 sm:pt-20">
      <p className="text-xl text-ink-soft">Dear {guest.name},</p>
      <h1 className="mt-2 text-headline font-semibold">You&rsquo;re invited</h1>

      <section aria-label="Invitation" className="mt-10 border-t border-line pt-8">
        <InviteMessage english={guest.event.inviteMessage ?? ''} translations={guest.event.translations ?? []} />
      </section>

      <dl className="mt-12 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">Seats</dt>
          <dd className="tabular mt-1 text-xl font-medium">{guest.seats ?? 1}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Table</dt>
          <dd className="mt-1 text-xl font-medium">{guest.table ?? 'Given at the door'}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Venue</dt>
          <dd className="mt-1 text-xl font-medium">{guest.event.venue?.name}</dd>
          <dd className="text-ink-soft">{guest.event.city}</dd>
        </div>
      </dl>

      <section aria-label="Reply" className="mt-12 max-w-2xl border-t border-line pt-8">
        <RsvpForm code={code} current={guest.rsvp ?? null} />
      </section>

      <section className="mt-12 max-w-2xl border-t border-line pt-8">
        <h2 className="text-lg font-semibold">Aso ebi</h2>
        <p className="mt-2 text-ink-soft">
          {firstName}, your family&rsquo;s colours are ready to order. Your invite code is{' '}
          <span className="tabular font-medium text-ink">{code}</span>; you&rsquo;ll need it at checkout.
        </p>
        <Link href="/aso-ebi" className="mt-4 inline-block font-medium text-accent underline underline-offset-4">
          Order your aso ebi
        </Link>
      </section>
    </main>
  )
}
