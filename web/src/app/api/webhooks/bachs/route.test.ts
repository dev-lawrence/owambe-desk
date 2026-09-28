import {beforeEach, describe, expect, test, vi} from 'vitest'

import {signLikeBachs} from '@/lib/bachs/signature'

const deps = {
  findOrder: vi.fn(),
  findOrderByCheckout: vi.fn(),
  recordPayment: vi.fn(),
  workflowStage: vi.fn(),
  confirmPayment: vi.fn(),
  failPayment: vi.fn(),
}
vi.mock('@/lib/bachs/webhook-deps.server', () => ({webhookDeps: () => deps}))

const {POST} = await import('./route')

const secret = 'whsec_route_test'
const body = JSON.stringify({
  id: 'evt_route',
  type: 'collection.succeeded',
  created_at: '2026-10-01T09:05:00Z',
  data: {charge_id: 'ch_1', checkout_id: 'chk_1', status: 'SUCCEEDED', amount: '90000.00', currency: 'NGN', metadata: {orderId: 'order-1'}},
})
const post = (headers: Record<string, string>, raw = body) =>
  POST(new Request('http://localhost/api/webhooks/bachs', {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: raw}))

beforeEach(() => {
  process.env.BACHS_WEBHOOK_SECRET = secret
  for (const fn of Object.values(deps)) fn.mockReset()
})

describe('POST /api/webhooks/bachs: an unsigned or invalid webhook cannot mark an order paid', () => {
  test('unsigned: 401, and no order is even looked up', async () => {
    const response = await post({})
    expect(response.status).toBe(401)
    for (const fn of Object.values(deps)) expect(fn).not.toHaveBeenCalled()
  })

  test('signed with the wrong secret: 401, nothing touched', async () => {
    const response = await post(signLikeBachs(body, 'whsec_wrong'))
    expect(response.status).toBe(401)
    expect(deps.recordPayment).not.toHaveBeenCalled()
    expect(deps.confirmPayment).not.toHaveBeenCalled()
  })

  test('valid signature but tampered amount: 401, nothing touched', async () => {
    const response = await post(signLikeBachs(body, secret), body.replace('90000.00', '1.00'))
    expect(response.status).toBe(401)
    expect(deps.confirmPayment).not.toHaveBeenCalled()
  })

  test('a correctly signed payment reaches the handler and confirms the order', async () => {
    deps.findOrder.mockResolvedValue({_id: 'order-1', _rev: 'r1', amount: {amount: '90000.00', currency: 'NGN'}, bachsCheckoutSessionId: 'chk_1', bachsPaymentId: null})
    deps.workflowStage.mockResolvedValue({instanceId: 'wf-1', stage: 'awaiting-payment'})
    deps.confirmPayment.mockResolvedValue('paid')
    const response = await post(signLikeBachs(body, secret))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({result: 'paid', orderId: 'order-1', stage: 'paid'})
  })

  test('a handler error returns 500 so Bachs retries', async () => {
    deps.findOrder.mockRejectedValue(new Error('Content Lake unavailable'))
    const response = await post(signLikeBachs(body, secret))
    expect(response.status).toBe(500)
  })
})
