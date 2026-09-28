import {verifyBachsSignature} from '@/lib/bachs/signature'
import {handleBachsEvent, isBachsEvent} from '@/lib/bachs/webhook'
import {webhookDeps} from '@/lib/bachs/webhook-deps.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // The raw bytes, before any JSON parsing: re-serialising would change them and break the signature.
  const rawBody = await request.text()
  const check = verifyBachsSignature({rawBody, headers: request.headers, secret: process.env.BACHS_WEBHOOK_SECRET ?? ''})
  if (!check.ok) {
    console.warn(`[bachs] rejected webhook: ${check.reason}`)
    return Response.json({error: 'Invalid signature'}, {status: 401})
  }

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    return Response.json({error: 'Body is not JSON'}, {status: 400})
  }
  if (!isBachsEvent(event)) return Response.json({error: 'Not a Bachs event'}, {status: 400})

  try {
    const outcome = await handleBachsEvent(event, webhookDeps())
    console.info(`[bachs] ${event.type} ${event.id}: ${JSON.stringify(outcome)}`)
    // 200 for everything we handled or deliberately ignored, so Bachs stops retrying.
    return Response.json(outcome, {status: 200})
  } catch (error) {
    // 500 makes Bachs retry: the handler is idempotent, so a retry is safe.
    console.error(`[bachs] failed to handle ${event.type} ${event.id}`, error)
    return Response.json({error: 'Handler failed; retry'}, {status: 500})
  }
}
