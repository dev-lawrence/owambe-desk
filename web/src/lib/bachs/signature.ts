import {createHmac, timingSafeEqual} from 'node:crypto'

// Verifies a Bachs webhook exactly as https://docs.bachs.io/guides/webhooks/overview specifies:
// HMAC-SHA256 hex digest of "{timestamp}.{raw_body}" with the endpoint's signing secret.
// Prefers X-Bachs-Signature-V2 ("t={ts},v1={sig}[,v1={sig}]"), accepting ANY v1 so a secret
// rotation doesn't break delivery, and falls back to X-Bachs-Timestamp + X-Bachs-Signature.

export const SIGNATURE_TOLERANCE_SECONDS = 300

export type SignatureCheck = {ok: true; timestamp: number} | {ok: false; reason: string}

type HeaderSource = {get(name: string): string | null}

function digest(secret: string, timestamp: number, rawBody: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
}

function sameHex(a: string, b: string) {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function parseV2(header: string): {timestamp: string | undefined; signatures: string[]} {
  let timestamp: string | undefined
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key === 't') timestamp = value
    if (key === 'v1' && value) signatures.push(value)
  }
  return {timestamp, signatures}
}

/** `rawBody` must be the exact bytes Bachs sent, read before any JSON parsing. */
export function verifyBachsSignature(args: {
  rawBody: string
  headers: HeaderSource
  secret: string
  nowSeconds?: number
  toleranceSeconds?: number
}): SignatureCheck {
  const {rawBody, headers, secret} = args
  if (!secret) return {ok: false, reason: 'No webhook signing secret is configured'}
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = args.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS

  const v2 = headers.get('x-bachs-signature-v2')
  const parsed = v2
    ? parseV2(v2)
    : {timestamp: headers.get('x-bachs-timestamp') ?? undefined, signatures: [headers.get('x-bachs-signature') ?? ''].filter(Boolean)}

  if (!parsed.timestamp || parsed.signatures.length === 0) return {ok: false, reason: 'Missing Bachs signature headers'}
  if (!/^\d+$/.test(parsed.timestamp)) return {ok: false, reason: 'Malformed signature timestamp'}
  const timestamp = Number(parsed.timestamp)
  if (Math.abs(now - timestamp) > tolerance) return {ok: false, reason: 'Signature timestamp is outside the tolerance window'}

  const expected = digest(secret, timestamp, rawBody)
  return parsed.signatures.some((signature) => sameHex(expected, signature))
    ? {ok: true, timestamp}
    : {ok: false, reason: 'Signature does not match'}
}

/** Sign a body the way Bachs does. Used by tests and the local webhook simulator. */
export function signLikeBachs(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = digest(secret, timestamp, rawBody)
  return {
    'x-bachs-timestamp': String(timestamp),
    'x-bachs-signature': signature,
    'x-bachs-signature-v2': `t=${timestamp},v1=${signature}`,
  }
}
