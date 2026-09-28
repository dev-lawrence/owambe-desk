'use client'

import {describeDrift, liveState, watTime, type LiveItem, type LiveItemInput} from '@owambe/shared'
import {useEffect, useState} from 'react'

type Item = LiveItemInput & {sideOfInterest: string | null; owner: string | null}

const sideLabel = (side: string | null) =>
  side === 'bride' ? 'Bride’s family' : side === 'groom' ? 'Groom’s family' : side === 'both' ? 'Both families' : null

function useNow(intervalMs: number) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function LiveProgram({items}: {items: Item[]}) {
  // Rendered without a clock on the server, so the first paint never disagrees with the browser's time.
  const now = useNow(30_000)
  const state = liveState(items, now ?? new Date(0))
  const byId = new Map(items.map((item) => [item._id, item]))
  const live = now !== null && state.started

  return (
    <>
      <section aria-live="polite" aria-label="Now" className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Panel label="On now" value={live && state.running ? state.running.title : state.finished ? 'That’s the end of the program' : 'Not started yet'}>
          {live && state.running?.actualStart ? `since ${watTime(state.running.actualStart)}` : null}
        </Panel>
        <Panel label="Next" value={state.next?.title ?? '—'}>
          {state.next?.plannedStart ? `planned ${watTime(state.next.plannedStart)}` : null}
        </Panel>
        <Panel label="Timing" value={!live ? 'Starts as planned' : state.driftMinutes === 0 ? 'On time' : `Running ${describeDrift(state.driftMinutes)}`}>
          {state.projectedFinish ? `finishing around ${watTime(state.projectedFinish)}` : null}
        </Panel>
      </section>

      <ol className="mt-12 border-t border-line">
        {state.items.map((item) => (
          <Row key={item._id} item={item} meta={byId.get(item._id)} />
        ))}
      </ol>
    </>
  )
}

function Panel({label, value, children}: {label: string; value: string | null; children?: React.ReactNode}) {
  return (
    <div className="bg-paper p-5">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 text-xl leading-snug font-semibold tracking-tight">{value}</p>
      {children ? <p className="tabular mt-1 text-sm text-ink-soft">{children}</p> : null}
    </div>
  )
}

function Row({item, meta}: {item: LiveItem; meta: Item | undefined}) {
  const running = item.status === 'running'
  const done = item.status === 'done'
  const detail = [sideLabel(meta?.sideOfInterest ?? null), meta?.owner].filter(Boolean).join(' · ')

  return (
    <li
      aria-current={running ? 'step' : undefined}
      className={`grid grid-cols-[4.5rem_1fr] gap-4 border-b border-line py-4 transition-colors duration-500 sm:grid-cols-[6rem_1fr_auto] ${running ? 'bg-accent/8 -mx-3 px-3' : ''} ${done ? 'text-ink-soft' : ''}`}
    >
      <span className="tabular">
        <span className="block font-medium">{item.actualStart ? watTime(item.actualStart) : item.plannedStart ? watTime(item.plannedStart) : '—'}</span>
        <span className="block text-sm text-ink-soft">{item.plannedDuration} min</span>
      </span>
      <span>
        <span className={`block font-medium ${done ? 'line-through decoration-line' : ''}`}>{item.title}</span>
        {detail ? <span className="block text-sm text-ink-soft">{detail}</span> : null}
      </span>
      <span className="col-start-2 text-sm sm:col-start-3 sm:text-right">
        {running ? <span className="font-medium text-accent">On now</span> : done ? 'Done' : item.status === 'skipped' ? 'Moved' : null}
        {item.startDrift !== null && item.startDrift > 0 ? <span className="tabular block text-ink-soft">started {item.startDrift} min late</span> : null}
      </span>
    </li>
  )
}
