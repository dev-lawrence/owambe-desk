// Money is stored as a decimal string at currency precision ("45000.00"), never a float.
// Arithmetic happens in integer minor units (kobo) using BigInt.

export const DECIMAL_AMOUNT = /^(0|[1-9]\d*)\.\d{2}$/

export type Money = {amount: string; currency: 'NGN'}

export function toMinor(amount: string): bigint {
  if (!DECIMAL_AMOUNT.test(amount)) throw new Error(`Invalid decimal amount: "${amount}"`)
  const [whole, fraction] = amount.split('.') as [string, string]
  return BigInt(whole) * 100n + BigInt(fraction)
}

export function fromMinor(minor: bigint): string {
  if (minor < 0n) throw new Error('Negative amounts are not supported')
  const whole = minor / 100n
  const fraction = (minor % 100n).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}

export function multiply(amount: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Invalid quantity: ${quantity}`)
  return fromMinor(toMinor(amount) * BigInt(quantity))
}

export function sum(amounts: readonly string[]): string {
  return fromMinor(amounts.reduce((total, a) => total + toMinor(a), 0n))
}

const grouped = new Intl.NumberFormat('en-NG')

/** "45000.00" -> "₦45,000"; "18500.50" -> "₦18,500.50" */
export function formatNaira(amount: string): string {
  const minor = toMinor(amount)
  const whole = grouped.format(minor / 100n)
  const kobo = minor % 100n
  return kobo === 0n ? `₦${whole}` : `₦${whole}.${kobo.toString().padStart(2, '0')}`
}
