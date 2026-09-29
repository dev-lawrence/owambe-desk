import {FABRIC_TYPES} from '@owambe/shared'
import {ASO_EBI_LOTS_QUERY} from '@owambe/shared/queries'
import type {Metadata} from 'next'

import {sanityFetch} from '@/sanity/live'

import {type LotOption, OrderForm} from './order-form'

// Shows live content, so it is rendered on every request instead of served from a build-time cache.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {title: 'Aso ebi · Tolu & Emeka'}

export default async function AsoEbiPage() {
  const {data: lots} = await sanityFetch({query: ASO_EBI_LOTS_QUERY, stega: false})

  const options: LotOption[] = lots
    .filter((lot) => lot.price?.amount && lot.colourName)
    .map((lot) => ({
      _id: lot._id,
      label: `${lot.colourName} ${FABRIC_TYPES.find((f) => f.value === lot.fabricType)?.title ?? ''}`.trim(),
      unit: lot.unit ?? '',
      price: lot.price!.amount!,
      hex: lot.colour?.hex ?? null,
      remaining: Math.max(0, (lot.stock ?? 0) - (lot.paidQuantity ?? 0)),
    }))

  return (
    <main className="mx-auto max-w-6xl px-5 pt-16 pb-24 sm:px-8 sm:pt-24">
      <h1 className="text-headline font-semibold">Aso ebi</h1>
      <p className="mt-4 max-w-2xl text-ink-soft">
        Emerald and gold for the bride&rsquo;s family, wine and champagne for the groom&rsquo;s. Pay here and we&rsquo;ll
        send it to the tailor, or hand you the fabric to sew yourself.
      </p>
      <OrderForm lots={options} />
    </main>
  )
}
