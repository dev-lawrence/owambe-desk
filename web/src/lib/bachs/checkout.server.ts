import 'server-only'

// Creates a Bachs hosted checkout for an aso ebi order, as documented at
// https://docs.bachs.io/guides/checkout/checkout-sessions ("Charge a raw amount").
// Prices live in Sanity, so we send a raw NGN amount rather than a Bachs catalog product.

type CheckoutSession = {checkout_id: string; checkout_url: string; status: string; expires_at: string}

function bachsBaseUrl(key: string) {
  if (key.startsWith('sk_sandbox_')) return 'https://sandbox-api.bachs.io'
  if (key.startsWith('sk_live_')) {
    // This project is a demo on sandbox. Refuse live keys unless someone opts in on purpose.
    if (process.env.BACHS_ALLOW_LIVE !== 'true') throw new Error('Refusing to use a live Bachs key (set BACHS_ALLOW_LIVE=true to allow).')
    return 'https://api.bachs.io'
  }
  throw new Error('BACHS_SECRET_KEY must start with sk_sandbox_ or sk_live_.')
}

export async function createCheckoutSession(args: {
  orderId: string
  attempt: number
  amount: string
  successUrl: string
  cancelUrl: string
  description: string
}): Promise<CheckoutSession> {
  const key = process.env.BACHS_SECRET_KEY
  if (!key) throw new Error('Missing BACHS_SECRET_KEY. See web/.env.example.')

  const response = await fetch(`${bachsBaseUrl(key)}/v1/checkout-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Retrying the same attempt returns the same session instead of opening a second one.
      'Idempotency-Key': `owambe-order-${args.orderId}-attempt-${args.attempt}`,
    },
    body: JSON.stringify({
      pricing: {currency: 'NGN', amount: args.amount},
      payment_method_types: ['NGN_CARD', 'NGN_BANK_TRANSFER'],
      // The webhook finds the order by this. The hosted page collects the guest's email and name,
      // so no contact details are stored in our (public) dataset.
      metadata: {orderId: args.orderId, attempt: String(args.attempt), description: args.description},
      reference: `owambe-${args.orderId}-${args.attempt}`,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      expires_in_minutes: 60,
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Bachs could not create the checkout (${response.status}): ${detail.slice(0, 300)}`)
  }
  return (await response.json()) as CheckoutSession
}
