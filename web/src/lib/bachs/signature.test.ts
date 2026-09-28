import {describe, expect, test} from 'vitest'

import {signLikeBachs, verifyBachsSignature} from './signature'

const secret = 'whsec_test_secret'
const body = JSON.stringify({id: 'evt_1', type: 'collection.succeeded', created_at: '2026-10-01T09:00:00Z', data: {}})
const now = 1_790_000_000
const headers = (h: Record<string, string>) => new Headers(h)

describe('verifyBachsSignature', () => {
  test('accepts a correctly signed V2 delivery', () => {
    const signed = signLikeBachs(body, secret, now)
    expect(verifyBachsSignature({rawBody: body, headers: headers({'x-bachs-signature-v2': signed['x-bachs-signature-v2']}), secret, nowSeconds: now})).toEqual({ok: true, timestamp: now})
  })

  test('accepts the legacy timestamp + signature pair', () => {
    const signed = signLikeBachs(body, secret, now)
    const legacy = headers({'x-bachs-timestamp': signed['x-bachs-timestamp'], 'x-bachs-signature': signed['x-bachs-signature']})
    expect(verifyBachsSignature({rawBody: body, headers: legacy, secret, nowSeconds: now}).ok).toBe(true)
  })

  test('accepts any v1 during a secret rotation', () => {
    const current = signLikeBachs(body, secret, now)['x-bachs-signature']
    const header = `t=${now},v1=${'0'.repeat(64)},v1=${current}`
    expect(verifyBachsSignature({rawBody: body, headers: headers({'x-bachs-signature-v2': header}), secret, nowSeconds: now}).ok).toBe(true)
  })

  test('rejects an unsigned delivery', () => {
    expect(verifyBachsSignature({rawBody: body, headers: headers({}), secret, nowSeconds: now})).toMatchObject({ok: false, reason: 'Missing Bachs signature headers'})
  })

  test('rejects a delivery signed with another secret', () => {
    const signed = signLikeBachs(body, 'whsec_attacker', now)
    expect(verifyBachsSignature({rawBody: body, headers: headers(signed), secret, nowSeconds: now})).toMatchObject({ok: false, reason: 'Signature does not match'})
  })

  test('rejects a tampered body', () => {
    const signed = signLikeBachs(body, secret, now)
    const tampered = body.replace('evt_1', 'evt_2')
    expect(verifyBachsSignature({rawBody: tampered, headers: headers(signed), secret, nowSeconds: now}).ok).toBe(false)
  })

  test('rejects a stale (replayed) delivery', () => {
    const signed = signLikeBachs(body, secret, now - 301)
    expect(verifyBachsSignature({rawBody: body, headers: headers(signed), secret, nowSeconds: now})).toMatchObject({ok: false, reason: 'Signature timestamp is outside the tolerance window'})
  })

  test('rejects everything when no secret is configured', () => {
    const signed = signLikeBachs(body, '', now)
    expect(verifyBachsSignature({rawBody: body, headers: headers(signed), secret: '', nowSeconds: now}).ok).toBe(false)
  })
})
