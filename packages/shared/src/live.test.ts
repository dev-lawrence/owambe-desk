import {describe, expect, it} from 'vitest'

import {describeDrift, fromWat, liveState, watDate, watTime, type LiveItemInput} from './live'

// 14:00, 14:30 and 15:00 WAT: three 30-minute segments back to back.
const at = (hhmm: string) => fromWat('2026-12-12', hhmm).toISOString()
const plan = (): LiveItemInput[] => [
  {_id: 'a', title: 'Kola', plannedStart: at('14:00'), plannedDuration: 30},
  {_id: 'b', title: 'Entrance', plannedStart: at('14:30'), plannedDuration: 30},
  {_id: 'c', title: 'Meal', plannedStart: at('15:00'), plannedDuration: 30},
]
const now = (hhmm: string) => fromWat('2026-12-12', hhmm)

describe('liveState', () => {
  it('before anything starts, on time until the first planned start passes', () => {
    expect(liveState(plan(), now('13:50')).driftMinutes).toBe(0)
    const late = liveState(plan(), now('14:12'))
    expect(late.driftMinutes).toBe(12)
    expect(late.next?._id).toBe('a')
    expect(late.started).toBe(false)
  })

  it('a late start carries through to the next segment', () => {
    const items = plan()
    items[0]!.actualStart = at('14:15')
    const state = liveState(items, now('14:20'))
    expect(state.running?._id).toBe('a')
    expect(state.next?._id).toBe('b')
    expect(state.items[0]!.startDrift).toBe(15)
    // Kola started 15 late and is planned for 30 minutes, so the entrance cannot start before 14:45.
    expect(state.driftMinutes).toBe(15)
  })

  it('an overrunning segment makes the drift grow with the clock', () => {
    const items = plan()
    items[0]!.actualStart = at('14:00')
    expect(liveState(items, now('14:30')).driftMinutes).toBe(0)
    expect(liveState(items, now('14:41')).driftMinutes).toBe(11)
  })

  it('a segment that ended early lets the day run ahead', () => {
    const items = plan()
    items[0]!.actualStart = at('14:00')
    items[0]!.actualEnd = at('14:20')
    const state = liveState(items, now('14:22'))
    expect(state.items[0]!.overrun).toBe(-10)
    expect(state.driftMinutes).toBe(-8)
  })

  it('a gap after a segment ends counts as drift once the next planned start passes', () => {
    const items = plan()
    items[0]!.actualStart = at('14:00')
    items[0]!.actualEnd = at('14:30')
    expect(liveState(items, now('14:30')).driftMinutes).toBe(0)
    expect(liveState(items, now('14:44')).driftMinutes).toBe(14)
  })

  it('marks a segment skipped when a later one has started, and moves on', () => {
    const items = plan()
    items[0]!.actualStart = at('14:00')
    items[0]!.actualEnd = at('14:30')
    items[2]!.actualStart = at('14:31')
    const state = liveState(items, now('14:35'))
    expect(state.items.map((i) => i.status)).toEqual(['done', 'skipped', 'running'])
    expect(state.next).toBeNull()
    // Nothing left after the meal: drift is how late the meal will end (planned 15:30, now 15:01).
    expect(state.driftMinutes).toBe(-29)
  })

  it('reports the finish: late last segment, projected and actual', () => {
    const items = plan()
    for (const [i, s, e] of [[0, '14:00', '14:30'], [1, '14:30', '15:10'], [2, '15:10', '15:45']] as const) {
      items[i]!.actualStart = at(s)
      items[i]!.actualEnd = at(e)
    }
    const state = liveState(items, now('16:00'))
    expect(state.finished).toBe(true)
    expect(state.driftMinutes).toBe(15)
    expect(state.projectedFinish?.toISOString()).toBe(at('15:45'))
    expect(state.plannedFinish?.toISOString()).toBe(at('15:30'))
  })

  it('projects the finish from the current drift', () => {
    const items = plan()
    items[0]!.actualStart = at('14:20')
    expect(liveState(items, now('14:25')).projectedFinish?.toISOString()).toBe(at('15:50'))
  })

  it('treats the latest-started segment as the one on stage if an end was missed', () => {
    const items = plan()
    items[0]!.actualStart = at('14:00')
    items[1]!.actualStart = at('14:35')
    const state = liveState(items, now('14:40'))
    expect(state.running?._id).toBe('b')
    expect(state.next?._id).toBe('c')
    expect(state.driftMinutes).toBe(5)
  })
})

describe('time helpers', () => {
  it('formats in West Africa Time, whatever the machine zone', () => {
    expect(watTime('2026-12-12T13:05:00.000Z')).toBe('14:05')
    expect(watDate('2026-12-12T23:30:00.000Z')).toBe('2026-12-13')
    expect(fromWat('2026-12-12', '14:05').toISOString()).toBe('2026-12-12T13:05:00.000Z')
  })

  it('describes drift in plain words', () => {
    expect(describeDrift(0)).toBe('on time')
    expect(describeDrift(12)).toBe('12 min late')
    expect(describeDrift(-4)).toBe('4 min early')
    expect(describeDrift(75)).toBe('1 h 15 min late')
    expect(describeDrift(120)).toBe('2 h late')
  })
})
