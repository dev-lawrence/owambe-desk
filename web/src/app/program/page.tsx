import {PROGRAM_QUERY} from '@owambe/shared/queries'
import type {Metadata} from 'next'
import {notFound} from 'next/navigation'

import {sanityFetch} from '@/sanity/live'

import {LiveProgram} from './live-program'

export const metadata: Metadata = {title: 'Program · Tolu & Emeka'}

export default async function ProgramPage() {
  const {data: program} = await sanityFetch({query: PROGRAM_QUERY, stega: false})
  if (!program) notFound()

  return (
    <main className="mx-auto max-w-6xl px-5 pt-16 pb-24 sm:px-8 sm:pt-20">
      <h1 className="text-headline font-semibold">Program of events</h1>
      <p className="mt-4 max-w-2xl text-ink-soft">
        On the day, the coordinator marks each part as it starts and ends. This page follows along on its own, so you
        can see what&rsquo;s happening from the car park.
      </p>
      <LiveProgram items={(program.items ?? []).filter((item) => item !== null)} />
    </main>
  )
}
