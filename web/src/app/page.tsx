import {EVENT_QUERY} from '@owambe/shared/queries'
import Link from 'next/link'
import {notFound} from 'next/navigation'

import {sanityFetch} from '@/sanity/live'

const dateFormat = new Intl.DateTimeFormat('en-NG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})

export default async function HomePage() {
  const {data: event} = await sanityFetch({query: EVENT_QUERY, stega: false})
  if (!event) notFound()

  const [first, second] = event.couple ?? []
  const firstName = (name?: string | null) => name?.split(' ')[0] ?? ''

  return (
    <main className="mx-auto max-w-6xl px-5 pt-16 pb-24 sm:px-8 sm:pt-24">
      <h1 className="text-display font-semibold">
        {firstName(first?.name)}
        <span className="text-accent"> &amp; </span>
        {firstName(second?.name)}
      </h1>

      <dl className="mt-12 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">Date</dt>
          <dd className="mt-1 text-xl font-medium">
            {event.date ? dateFormat.format(new Date(`${event.date}T12:00:00+01:00`)) : 'To be confirmed'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Venue</dt>
          <dd className="mt-1 text-xl font-medium">{event.venue?.name}</dd>
          <dd className="text-ink-soft">{event.venue?.address}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">City</dt>
          <dd className="mt-1 text-xl font-medium">{event.city}</dd>
        </div>
      </dl>

      <section aria-labelledby="colours" className="mt-16">
        <h2 id="colours" className="text-2xl font-semibold tracking-tight">
          Colours of the day
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {event.colours?.map((colour) => (
            <li key={colour._key} className="rounded-md border border-line p-3">
              <span
                aria-hidden="true"
                className="block h-20 rounded-sm"
                style={{backgroundColor: colour.hex ?? undefined}}
              />
              <span className="mt-3 block font-medium">{colour.name}</span>
              <span className="block text-sm text-ink-soft">
                {colour.side === 'bride' ? "Bride's family" : colour.side === 'groom' ? "Groom's family" : 'Both families'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about" className="mt-16 max-w-2xl">
        <h2 id="about" className="text-2xl font-semibold tracking-tight">
          About this site
        </h2>
        <p className="mt-4 text-ink-soft">
          Owambe Desk is how this wedding is being planned and run. Both families approve the program of events before it
          is printed. Aso ebi is paid for before it goes to the tailor. On the day, the coordinator runs the program live
          from one screen, and this site updates as it happens.
        </p>
        <ul className="mt-6 grid gap-3 border-t border-line pt-6">
          {[
            {href: '/program', label: 'Follow the program live', note: 'What is on now, and how late we are running.'},
            {href: '/aso-ebi', label: 'Order aso ebi', note: 'Pay online with your invite code.'},
            {href: '/how-it-works', label: 'See how it works', note: 'Every approval and payment, with who did it and why.'},
          ].map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="font-medium text-accent underline underline-offset-4">
                {link.label}
              </Link>
              <span className="block text-ink-soft">{link.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
