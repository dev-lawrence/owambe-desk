import {AlertCircleIcon, CheckmarkCircle02Icon, Clock01Icon, PackageDeliveredIcon, Scissor01Icon} from '@hugeicons/core-free-icons'
import {HugeiconsIcon, type IconSvgElement} from '@hugeicons/react'
import {FABRIC_TYPES, formatNaira} from '@owambe/shared'
import {ORDER_QUERY} from '@owambe/shared/queries'
import {findOpenInstance} from '@owambe/workflows'
import type {WorkflowInstance} from '@sanity/workflow-engine'
import type {Metadata} from 'next'
import {notFound} from 'next/navigation'

import {orderSubject, webServer} from '@/lib/workflow/engines.server'
import {sanityFetch} from '@/sanity/live'

import {retryCheckout} from '../../actions'

export const metadata: Metadata = {title: 'Your aso ebi order · Tolu & Emeka'}

const time = new Intl.DateTimeFormat('en-NG', {hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos'})

type Status = {icon: IconSvgElement; title: string; body: string; retry?: boolean}

async function latestInstance(orderId: string): Promise<WorkflowInstance | null> {
  const {engine} = webServer()
  const open = await findOpenInstance(engine, 'aso-ebi-order', orderSubject(orderId).id)
  if (open) return open
  // A collected order's workflow is complete; find it too.
  const [id] = await engine.query<string[]>({
    groq: '*[_type == "sanity.workflow.instance" && tag == $tag && definition == "aso-ebi-order" && count(fields[name == "subject" && value.id == $subject]) > 0] | order(startedAt desc)._id',
    params: {subject: orderSubject(orderId).id},
  })
  return id ? engine.getInstance({instanceId: id}) : null
}

function status(paidAt: string | null, instance: WorkflowInstance | null): Status {
  const stage = instance?.currentStage
  if (stage === 'collected') return {icon: PackageDeliveredIcon, title: 'Collected', body: 'You have your aso ebi. See you at the party.'}
  if (stage === 'ready') return {icon: PackageDeliveredIcon, title: 'Ready for collection', body: 'Your aso ebi is ready. Collect it from the coordinator.'}
  if (stage === 'with-tailor') return {icon: Scissor01Icon, title: 'With the tailor', body: 'The tailor is sewing it. We will tell you when it is ready.'}
  if (paidAt) {
    return {icon: CheckmarkCircle02Icon, title: 'Paid', body: `Bachs confirmed your payment at ${time.format(new Date(paidAt))}. The coordinator will send it to the tailor.`}
  }
  if (stage === 'ordered') {
    const failures = instance?.fields.find((f) => f.name === 'failedAttempts')?.value
    const last = Array.isArray(failures) ? (failures.at(-1) as {reason?: string} | undefined) : undefined
    return last
      ? {icon: AlertCircleIcon, title: 'Payment did not go through', body: `${last.reason ?? 'The payment failed'}. You have not been charged. You can try again.`, retry: true}
      : {icon: Clock01Icon, title: 'Not paid yet', body: 'Your order is saved, but payment has not started.', retry: true}
  }
  return {icon: Clock01Icon, title: 'Waiting for Bachs', body: 'We are waiting for Bachs to confirm your payment. This page updates by itself; there is no need to refresh.'}
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{orderId: string}>
  searchParams: Promise<{checkout?: string}>
}) {
  const {orderId} = await params
  const {checkout} = await searchParams
  // Live: when the webhook writes paidAt, this page re-renders without a refresh.
  const {data: order} = await sanityFetch({query: ORDER_QUERY, params: {orderId}, stega: false})
  if (!order) notFound()
  const instance = await latestInstance(orderId)
  const current = status(order.paidAt, instance)
  const fabric = FABRIC_TYPES.find((f) => f.value === order.lot?.fabricType)?.title ?? ''

  return (
    <main className="mx-auto max-w-3xl px-5 pt-16 pb-24 sm:px-8 sm:pt-24">
      <h1 className="text-headline font-semibold">Your aso ebi</h1>

      <section aria-live="polite" aria-labelledby="status" className="mt-10 flex gap-4 rounded-lg border border-line p-6">
        <HugeiconsIcon icon={current.icon} size={28} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
        <div>
          <h2 id="status" className="text-2xl font-semibold tracking-tight">
            {current.title}
          </h2>
          <p className="mt-2 text-ink-soft">{current.body}</p>
          {checkout === 'unavailable' && current.retry ? (
            <p role="alert" className="mt-3">
              We could not open the payment page just now. Your order is saved; please try again in a minute.
            </p>
          ) : null}
          {current.retry ? (
            <form action={retryCheckout.bind(null, orderId)} className="mt-4">
              <button type="submit" className="rounded-md bg-accent px-5 py-3 font-medium text-accent-ink">
                Pay now
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <dl className="mt-10 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">For</dt>
          <dd className="mt-1 font-medium">{order.guestName}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Fabric</dt>
          <dd className="mt-1 font-medium">
            {order.quantity} × {order.lot?.colourName} {fabric}
          </dd>
          <dd className="text-sm text-ink-soft">{order.lot?.unit}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Total</dt>
          <dd className="tabular mt-1 font-medium">{order.amount?.amount ? formatNaira(order.amount.amount) : '—'}</dd>
        </div>
      </dl>
    </main>
  )
}
