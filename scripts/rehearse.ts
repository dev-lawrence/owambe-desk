// Rehearse the day. The demo event is on 12 December, so the live program cannot be shown running
// on any other day. This moves every segment's planned start by the same amount so the program
// starts a few minutes from now. `reset` puts the real planned times back from a local backup.
//
//   pnpm rehearse start [minutes]   first segment starts in [minutes] (default 2)
//   pnpm rehearse reset             restore the real plan
//
// Actual times (actualStart/actualEnd, written by clicking Start/End in the console) are NEVER
// backed up or restored — only plannedStart/plannedDuration are. A rehearsal is explicitly a
// sandbox for trying Start/End freely, so both `start` and `reset` always clear actual times
// unconditionally, whether or not a rehearsal was running yet. That also covers the case where
// someone clicks Start on a segment before ever running `rehearse start`: those actual times would
// otherwise get "frozen" into the backup as if they belonged to the real plan, and restored right
// back by `reset` (a real bug this script had until it was found and fixed here).
//
// This writes to the program items of the real program, and it says so on screen. Items are not
// frozen by the approval workflow (the coordinator writes actual times into them on the day), so
// no guard stops it; the backup is what makes it safe. Never run this on 12 December itself against
// a program that's actually running — it discards real actual times along with test ones.
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import {watDate, watTime} from '@owambe/shared'
import {createClient} from '@sanity/client'

type Item = {_id: string; title: string; plannedStart: string; plannedDuration: number}
type Backup = {programId: string; savedAt: string; items: Item[]}

const BACKUP = fileURLToPath(new URL('./.rehearsal.json', import.meta.url))

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

const PROGRAM = `*[_type == "programOfEvents" && !(_id in path("drafts.**"))] | order(_createdAt asc)[0]{
  _id, "items": items[]->{_id, title, plannedStart, plannedDuration}
}`

async function start(minutes: number) {
  if (existsSync(BACKUP)) throw new Error('A rehearsal is already running. `pnpm rehearse reset` first.')
  const program = await client.fetch<{_id: string; items: Item[]} | null>(PROGRAM)
  const first = program?.items[0]
  if (!program || !first) throw new Error('No program with items to rehearse.')

  const target = Math.ceil((Date.now() + minutes * 60_000) / 60_000) * 60_000
  const shift = target - new Date(first.plannedStart).getTime()

  writeFileSync(BACKUP, JSON.stringify({programId: program._id, savedAt: new Date().toISOString(), items: program.items} satisfies Backup, null, 2))
  const tx = client.transaction()
  for (const item of program.items) {
    // Unset unconditionally: someone may have clicked Start/End before ever rehearsing, and a
    // rehearsal starts clean regardless of what testing happened before it.
    tx.patch(item._id, (p) => p.set({plannedStart: new Date(new Date(item.plannedStart).getTime() + shift).toISOString()}).unset(['actualStart', 'actualEnd']))
  }
  await tx.commit()
  const last = program.items.at(-1)!
  const end = new Date(new Date(last.plannedStart).getTime() + shift + last.plannedDuration * 60_000)
  console.log(`Rehearsal: ${program.items.length} segments now run ${watDate(new Date(target))} ${watTime(new Date(target))}–${watTime(end)} WAT.`)
  console.log(`The real plan is saved in scripts/.rehearsal.json. Put it back with \`pnpm rehearse reset\`.`)
}

async function reset() {
  if (!existsSync(BACKUP)) throw new Error('No rehearsal to reset (scripts/.rehearsal.json is missing).')
  const backup = JSON.parse(readFileSync(BACKUP, 'utf8')) as Backup
  const tx = client.transaction()
  for (const item of backup.items) {
    // Unset unconditionally: a reset always means "back to a clean, unstarted plan," never
    // "whatever actual times happened to exist right before the rehearsal began."
    tx.patch(item._id, (p) => p.set({plannedStart: item.plannedStart, plannedDuration: item.plannedDuration}).unset(['actualStart', 'actualEnd']))
  }
  await tx.commit()
  rmSync(BACKUP)
  console.log(`Restored ${backup.items.length} segments to the plan saved at ${backup.savedAt}.`)
}

const [command, arg] = process.argv.slice(2)
const run = command === 'start' ? () => start(arg ? Number(arg) : 2) : command === 'reset' ? reset : null
if (!run) {
  console.error('Usage: pnpm rehearse <start [minutes]|reset>')
  process.exit(1)
}
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
