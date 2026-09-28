import {multiply, sum} from '@owambe/shared'

/** Board columns, in the order an order moves through them. */
export const ORDER_STAGES = [
  {name: 'ordered', title: 'Ordered'},
  {name: 'awaiting-payment', title: 'Awaiting payment'},
  {name: 'paid', title: 'Paid'},
  {name: 'with-tailor', title: 'With tailor'},
  {name: 'ready', title: 'Ready'},
  {name: 'collected', title: 'Collected'},
] as const

export type LotRow = {
  _id: string
  colourName: string | null
  fabricType: string | null
  price: {amount: string} | null
  stock: number | null
  orders: {quantity: number | null; amount: {amount: string} | null; paidAt: string | null}[] | null
}

export type LotTotals = {
  _id: string
  colourName: string
  fabricType: string | null
  paidUnits: number
  /** Naira actually collected: the sum of paid orders' amounts (their snapshot, not today's price). */
  collected: string
  unpaidUnits: number
  /** Stock minus paid units. Unpaid orders do not reserve stock (see BUILD_LOG, Phase 3). */
  remaining: number | null
  /** What the lot would bring in if every unit sold at today's price. */
  potential: string | null
}

export function lotTotals(lot: LotRow): LotTotals {
  const orders = lot.orders ?? []
  const paid = orders.filter((o) => o.paidAt && o.amount?.amount)
  const paidUnits = paid.reduce((n, o) => n + (o.quantity ?? 0), 0)
  const unpaidUnits = orders.filter((o) => !o.paidAt).reduce((n, o) => n + (o.quantity ?? 0), 0)
  return {
    _id: lot._id,
    colourName: lot.colourName ?? 'Unnamed lot',
    fabricType: lot.fabricType,
    paidUnits,
    collected: sum(paid.map((o) => o.amount!.amount)),
    unpaidUnits,
    remaining: lot.stock === null ? null : lot.stock - paidUnits,
    potential: (lot.stock ?? 0) > 0 && lot.price?.amount ? multiply(lot.price.amount, lot.stock!) : null,
  }
}

/**
 * The webhook records a payment on the order even when the workflow cannot take it (for example a
 * payment that lands after the checkout was already marked failed). The coordinator must reconcile
 * those by hand, so the board flags them.
 */
export function needsReview(order: {paidAt: string | null; bachsPaymentId: string | null} | null, stage: string): boolean {
  return Boolean(order?.paidAt && order.bachsPaymentId) && (stage === 'ordered' || stage === 'awaiting-payment')
}
