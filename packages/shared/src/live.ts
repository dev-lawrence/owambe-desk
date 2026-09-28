// Live program arithmetic, shared by the coordinator console and the public live program page.
// Pure functions over plain data and an explicit `now`, so they are testable and both surfaces
// always agree on what "running late" means.

export const EVENT_TIME_ZONE = 'Africa/Lagos'

/** Drift past this many minutes offers "Ask agent" in the console. The brief's threshold. */
export const DRIFT_ASK_AGENT_MINUTES = 10

const MINUTE = 60_000

/** "14:05" in West Africa Time, 24-hour. */
export function watTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: EVENT_TIME_ZONE}).format(
    new Date(iso),
  )
}

/** "2026-12-12": the calendar date in West Africa Time. */
export function watDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: EVENT_TIME_ZONE}).format(new Date(iso))
}

/** Nigeria is on WAT all year (UTC+1, no daylight saving), so a fixed offset is exact. */
export function fromWat(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+01:00`)
}

export type LiveItemInput = {
  _id: string
  title: string | null
  plannedStart: string | null
  plannedDuration: number | null
  actualStart?: string | null
  actualEnd?: string | null
}

export type LiveItemStatus = 'done' | 'running' | 'upcoming' | 'skipped'

export type LiveItem = LiveItemInput & {
  status: LiveItemStatus
  plannedEnd: Date | null
  /** Minutes late (positive) or early (negative) the segment actually started. */
  startDrift: number | null
  /** Minutes the segment ran over (positive) or under (negative) its planned length. Done segments only. */
  overrun: number | null
}

export type LiveState = {
  items: LiveItem[]
  running: LiveItem | null
  /** The next segment to start, in running order. */
  next: LiveItem | null
  /**
   * How far behind the plan the day is right now, in whole minutes. Positive means late.
   * It is the gap between when the next segment can realistically start and when it was planned to.
   */
  driftMinutes: number
  /** The plan's own end, and where it will land if the rest runs to plan from here. */
  plannedFinish: Date | null
  projectedFinish: Date | null
  started: boolean
  finished: boolean
}

const minutesBetween = (later: number, earlier: number) => Math.round((later - earlier) / MINUTE)
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null)

function plannedEndOf(item: LiveItemInput): number | null {
  const start = time(item.plannedStart)
  return start === null || item.plannedDuration === null ? null : start + item.plannedDuration * MINUTE
}

/**
 * Where the day stands. `items` must be in running order (the program's array order).
 *
 * Rules:
 * - A segment with an actual end is done; with only an actual start, running.
 * - A segment not started while a later one has started is "skipped". It can still be started.
 * - The next segment is the first unstarted one after the last started one.
 * - It can start no earlier than now, and no earlier than the running segment's planned length
 *   is up (or, before anything starts, its own planned time). Drift is that minus its planned start.
 * - With no next segment, drift is how late the last segment ends (or will end) against its plan.
 */
export function liveState(items: readonly LiveItemInput[], now: Date): LiveState {
  const nowMs = now.getTime()
  const lastStartedIndex = items.reduce((last, item, i) => (item.actualStart ? i : last), -1)

  const live: LiveItem[] = items.map((item, i) => {
    const plannedEnd = plannedEndOf(item)
    const planned = time(item.plannedStart)
    const actualStart = time(item.actualStart)
    const actualEnd = time(item.actualEnd)
    const status: LiveItemStatus = actualEnd !== null ? 'done' : actualStart !== null ? 'running' : i < lastStartedIndex ? 'skipped' : 'upcoming'
    return {
      ...item,
      status,
      plannedEnd: plannedEnd === null ? null : new Date(plannedEnd),
      startDrift: actualStart !== null && planned !== null ? minutesBetween(actualStart, planned) : null,
      overrun:
        actualStart !== null && actualEnd !== null && item.plannedDuration !== null
          ? minutesBetween(actualEnd, actualStart) - item.plannedDuration
          : null,
    }
  })

  // If several are marked running (a missed "end"), the latest to start is the one on stage.
  const running = live.filter((i) => i.status === 'running').sort((a, b) => (time(b.actualStart) ?? 0) - (time(a.actualStart) ?? 0))[0] ?? null
  const next = live.slice(lastStartedIndex + 1).find((i) => i.status === 'upcoming') ?? null
  const lastDone = [...live].reverse().find((i) => i.status === 'done') ?? null

  const runningPlannedEnd = running && running.plannedDuration !== null ? (time(running.actualStart) ?? 0) + running.plannedDuration * MINUTE : null

  let driftMinutes = 0
  if (next && next.plannedStart) {
    const planned = new Date(next.plannedStart).getTime()
    const earliest = runningPlannedEnd ?? (running ? nowMs : lastStartedIndex >= 0 ? (time(lastDone?.actualEnd) ?? nowMs) : planned)
    driftMinutes = minutesBetween(Math.max(nowMs, earliest), planned)
  } else if (running && runningPlannedEnd !== null && running.plannedEnd) {
    driftMinutes = minutesBetween(Math.max(nowMs, runningPlannedEnd), running.plannedEnd.getTime())
  } else if (lastDone && lastDone.plannedEnd && lastDone.actualEnd) {
    driftMinutes = minutesBetween(new Date(lastDone.actualEnd).getTime(), lastDone.plannedEnd.getTime())
  }

  const ends = live.map((i) => i.plannedEnd?.getTime()).filter((t): t is number => t !== undefined)
  const plannedFinish = ends.length ? new Date(Math.max(...ends)) : null
  const finished = live.length > 0 && live.every((i) => i.status === 'done' || i.status === 'skipped') && !running && !next
  const projectedFinish = plannedFinish
    ? finished && lastDone?.actualEnd
      ? new Date(lastDone.actualEnd)
      : new Date(plannedFinish.getTime() + driftMinutes * MINUTE)
    : null

  return {items: live, running, next, driftMinutes, plannedFinish, projectedFinish, started: lastStartedIndex >= 0, finished}
}

/** "12 min late", "4 min early", "on time". */
export function describeDrift(minutes: number): string {
  if (minutes === 0) return 'on time'
  const n = Math.abs(minutes)
  const amount = n >= 60 ? `${Math.floor(n / 60)} h ${n % 60 ? `${n % 60} min` : ''}`.trim() : `${n} min`
  return `${amount} ${minutes > 0 ? 'late' : 'early'}`
}
