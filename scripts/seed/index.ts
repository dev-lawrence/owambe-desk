// Seeds the demo wedding into the content dataset.
//   pnpm seed            refuses to run if Owambe content already exists
//   pnpm seed --reset    deletes Owambe content first, then seeds
import {randomUUID} from 'node:crypto'

import {generateInviteCode} from '@owambe/shared'
import {createClient, type IdentifiedSanityDocumentStub} from '@sanity/client'

import {brief, EVENT_DATE, event, familySides, guests, lots, people, vendors} from './data'

const SEEDED_TYPES = [
  'event', 'person', 'familySide', 'programOfEvents', 'programItem',
  'asoEbiLot', 'asoEbiOrder', 'guest', 'vendor',
]

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Copy scripts/.env.example to scripts/.env.local.`)
  return value
}

const client = createClient({
  projectId: env('SANITY_PROJECT_ID'),
  dataset: env('SANITY_DATASET'),
  apiVersion: env('SANITY_API_VERSION'),
  token: env('SANITY_API_WRITE_TOKEN'),
  useCdn: false,
})

// Deterministic PRNG so invite codes are the same on every seed run
// (the README links to a demo invite).
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ref = (id: string) => ({_type: 'reference' as const, _ref: id})
const key = () => randomUUID().slice(0, 12)

async function main() {
  const reset = process.argv.includes('--reset')
  const existing = await client.fetch<number>('count(*[_type in $types])', {types: SEEDED_TYPES})
  if (existing > 0 && !reset) {
    console.error(`Dataset already has ${existing} Owambe documents. Re-run with --reset to replace them.`)
    process.exit(1)
  }
  if (existing > 0) {
    // References between seeded documents block single deletes, so delete them together.
    const ids = await client.fetch<string[]>('*[_type in $types]._id', {types: SEEDED_TYPES})
    const tx = client.transaction()
    for (const id of ids) tx.delete(id)
    await tx.commit({visibility: 'async'})
    console.log(`Deleted ${ids.length} existing documents`)
  }

  const docs: IdentifiedSanityDocumentStub[] = []
  const personId = new Map<string, string>()
  for (const p of people) {
    const _id = randomUUID()
    personId.set(p.key, _id)
    docs.push({_id, _type: 'person', name: p.name, side: p.side, role: p.role})
  }
  const pid = (k: string) => {
    const id = personId.get(k)
    if (!id) throw new Error(`Unknown person key ${k}`)
    return id
  }

  const eventId = randomUUID()
  docs.push({
    _id: eventId,
    _type: 'event',
    title: event.title,
    couple: [{...ref(pid('tolu')), _key: key()}, {...ref(pid('emeka')), _key: key()}],
    date: EVENT_DATE,
    venue: event.venue,
    city: event.city,
    status: event.status,
    colours: event.colours.map((c) => ({_type: 'asoEbiColour', _key: key(), ...c})),
    inviteMessage: event.inviteMessage,
    inviteTranslations: [],
  })

  for (const f of familySides) {
    docs.push({
      _id: randomUUID(),
      _type: 'familySide',
      event: ref(eventId),
      side: f.side,
      approvers: f.approvers.map((a) => ({...ref(pid(a)), _key: key()})),
      nonNegotiables: f.nonNegotiables.map((n) => ({_type: 'nonNegotiable', _key: key(), ...n})),
      notes: f.notes,
    })
  }

  // The program starts empty at version 0: the agent writes the first draft (Phase 2).
  docs.push({_id: randomUUID(), _type: 'programOfEvents', event: ref(eventId), items: [], version: 0, brief})

  const vendorId = new Map<string, string>()
  for (const v of vendors) {
    const _id = randomUUID()
    vendorId.set(v.key, _id)
    docs.push({_id, _type: 'vendor', name: v.name, category: v.category, contact: ref(pid(v.contact)), event: ref(eventId)})
  }

  for (const l of lots) {
    const tailor = l.tailor ? vendorId.get(l.tailor) : undefined
    docs.push({
      _id: randomUUID(),
      _type: 'asoEbiLot',
      event: ref(eventId),
      colourName: l.colourName,
      fabricType: l.fabricType,
      unit: l.unit,
      price: {_type: 'money', amount: l.amount, currency: 'NGN'},
      stock: l.stock,
      ...(tailor ? {tailor: ref(tailor)} : {}),
    })
  }

  const random = mulberry32(20261212)
  const codes = new Set<string>()
  const guestRows: {name: string; code: string}[] = []
  for (const g of guests) {
    let code = generateInviteCode(random)
    while (codes.has(code)) code = generateInviteCode(random)
    codes.add(code)
    docs.push({
      _id: randomUUID(),
      _type: 'guest',
      person: ref(pid(g.person)),
      event: ref(eventId),
      inviteCode: code,
      seats: g.seats,
      table: g.table,
      rsvp: g.rsvp,
    })
    guestRows.push({name: people.find((p) => p.key === g.person)!.name, code})
  }

  const tx = client.transaction()
  for (const doc of docs) tx.create(doc)
  const result = await tx.commit()
  console.log(`Created ${result.results.length} documents in ${client.config().dataset}`)
  console.log('Sample invite codes:')
  for (const row of guestRows.slice(6, 10)) console.log(`  /i/${row.code}  ${row.name}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
