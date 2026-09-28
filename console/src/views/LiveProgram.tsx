import {AiMagicIcon, Clock01Icon, PlayIcon, StopIcon, Undo02Icon} from '@hugeicons/core-free-icons'
import {DRIFT_ASK_AGENT_MINUTES, describeDrift, liveState, watTime, type LiveItem} from '@owambe/shared'
import {editDocument, useApplyDocumentActions, useClient, useQuery} from '@sanity/sdk-react'
import {Badge, Box, Button, Card, Dialog, Flex, Grid, Stack, Text, TextArea} from '@sanity/ui'
import {refDataset, type WorkflowInstance} from '@sanity/workflow-engine'
import {useWorkflowInstances, useWorkflowSession} from '@sanity/workflow-sdk'
import {useId, useState} from 'react'

import {ActionBar} from '../components/Actions'
import {errorText, Icon, iconFor, Loading, Notice, useNow} from '../components/common'
import {Present, ReportPresence} from '../components/Presence'
import {API_VERSION, CONTENT_DATASET, gdr, PROJECT_ID} from '../config'
import {useEngine} from '../engine'
import {fieldValue, isFinished, stageTitle} from '../lib/workflow'

type Segment = {
  _id: string
  title: string | null
  plannedStart: string | null
  plannedDuration: number | null
  actualStart: string | null
  actualEnd: string | null
  sideOfInterest: string | null
  notes: string | null
  owner: string | null
}

const PROGRAM_QUERY = `*[_type == "programOfEvents" && !(_id in path("drafts.**"))] | order(_createdAt asc)[0]{
  _id, version,
  "items": items[]->{_id, title, plannedStart, plannedDuration, actualStart, actualEnd, sideOfInterest, notes, "owner": owner->name}
}`

const SIDE_LABEL: Record<string, string> = {bride: 'Bride’s side', groom: 'Groom’s side', both: 'Both'}

const itemHandle = (documentId: string) => ({documentId, documentType: 'programItem', liveEdit: true})

function driftTone(minutes: number) {
  if (minutes > DRIFT_ASK_AGENT_MINUTES) return 'critical' as const
  if (minutes > 0) return 'caution' as const
  return 'positive' as const
}

export function LiveProgram() {
  const {data: program} = useQuery<{_id: string; version: number; items: (Segment | null)[] | null} | null>({query: PROGRAM_QUERY})
  const now = useNow(15_000)

  if (!program) return <Notice>No program of events yet. The agent drafts it: `pnpm agent draft`.</Notice>
  const items = (program.items ?? []).filter((i): i is Segment => i !== null)
  const state = liveState(items, now)

  return (
    <Stack gap={5}>
      <Summary programId={program._id} version={program.version} state={state} />
      <Adjustments programId={program._id} driftMinutes={state.driftMinutes} canAsk={state.next !== null} />
      <Segments items={state.items as (LiveItem & Segment)[]} />
    </Stack>
  )
}

function Summary({programId, version, state}: {programId: string; version: number; state: ReturnType<typeof liveState>}) {
  const engine = useEngine()
  const {instances} = useWorkflowInstances({engine, filter: {definition: 'program-approval', document: gdr(programId)}})
  const approval = instances?.[0]
  return (
    <Stack gap={3}>
      <Grid gridTemplateColumns={[1, 2, 4]} gap={3}>
        <Card padding={3} radius={2} border tone={driftTone(state.driftMinutes)}>
          <Stack gap={2}>
            <Text size={1} muted>
              Drift
            </Text>
            <Text size={3} weight="semibold">
              {state.started ? describeDrift(state.driftMinutes) : state.driftMinutes > 0 ? `${describeDrift(state.driftMinutes)} to start` : 'Not started'}
            </Text>
          </Stack>
        </Card>
        <Card padding={3} radius={2} border>
          <Stack gap={2}>
            <Text size={1} muted>
              On now
            </Text>
            <Text size={2} weight="medium" textOverflow="ellipsis">
              {state.running ? state.running.title : '—'}
            </Text>
            {state.running?.actualStart ? (
              <Text size={1} muted>
                since {watTime(state.running.actualStart)}
              </Text>
            ) : null}
          </Stack>
        </Card>
        <Card padding={3} radius={2} border>
          <Stack gap={2}>
            <Text size={1} muted>
              Next
            </Text>
            <Text size={2} weight="medium" textOverflow="ellipsis">
              {state.next ? state.next.title : state.finished ? 'Program finished' : '—'}
            </Text>
            {state.next?.plannedStart ? (
              <Text size={1} muted>
                planned {watTime(state.next.plannedStart)}
              </Text>
            ) : null}
          </Stack>
        </Card>
        <Card padding={3} radius={2} border>
          <Stack gap={2}>
            <Text size={1} muted>
              Finish
            </Text>
            <Text size={2} weight="medium">
              {state.projectedFinish ? watTime(state.projectedFinish) : '—'}
            </Text>
            {state.plannedFinish ? (
              <Text size={1} muted>
                planned {watTime(state.plannedFinish)}
              </Text>
            ) : null}
          </Stack>
        </Card>
      </Grid>
      <Text size={1} muted>
        Version {version} of the program.{' '}
        {approval
          ? approval.currentStage === 'locked'
            ? 'Locked by the coordinator after both families approved.'
            : `Approval stage: ${stageTitle(approval)}. The families have not signed off this version yet; you can still run the day.`
          : 'No approval workflow found for this program.'}
      </Text>
    </Stack>
  )
}

function Segments({items}: {items: (LiveItem & Segment)[]}) {
  const apply = useApplyDocumentActions()
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = items.filter((i) => i.status === 'running')

  async function write(actions: Parameters<typeof apply>[0]) {
    setError(null)
    try {
      await apply(actions)
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  // Starting a segment ends whatever is on stage, in the same transaction: on the day, the next
  // thing starting is how the last one ends.
  const start = (item: Segment) => {
    const at = new Date().toISOString()
    return write([
      ...running.filter((r) => r._id !== item._id).map((r) => editDocument(itemHandle(r._id), {set: {actualEnd: at}})),
      editDocument(itemHandle(item._id), {set: {actualStart: at}, unset: ['actualEnd']}),
    ])
  }
  const end = (item: Segment) => write([editDocument(itemHandle(item._id), {set: {actualEnd: new Date().toISOString()}})])
  const undoStart = (item: Segment) => write([editDocument(itemHandle(item._id), {unset: ['actualStart', 'actualEnd']})])
  const undoEnd = (item: Segment) => write([editDocument(itemHandle(item._id), {unset: ['actualEnd']})])

  return (
    <Stack gap={2}>
      {error ? <Notice tone="critical">Could not save: {error}</Notice> : null}
      {items.map((item) => {
        const isSelected = selected === item._id
        const tone = item.status === 'running' ? 'primary' : item.status === 'skipped' ? 'caution' : 'default'
        return (
          <Card
            key={item._id}
            padding={3}
            radius={2}
            border
            tone={tone}
            style={{opacity: item.status === 'done' ? 0.7 : 1, cursor: 'pointer'}}
            onClick={() => setSelected(isSelected ? null : item._id)}
          >
            {isSelected ? <ReportPresence documentId={item._id} documentType="programItem" /> : null}
            <Flex gap={3} align="center" wrap="wrap">
              <Box style={{width: 56}}>
                <Text size={1} weight="medium">
                  {item.plannedStart ? watTime(item.plannedStart) : '--:--'}
                </Text>
                <Text size={0} muted>
                  {item.plannedDuration} min
                </Text>
              </Box>
              <Stack gap={2} flex={1} style={{minWidth: 200}}>
                <Text size={1} weight={item.status === 'running' ? 'semibold' : 'regular'}>
                  {item.title}
                </Text>
                <Text size={0} muted>
                  {[SIDE_LABEL[item.sideOfInterest ?? ''] ?? null, item.owner].filter(Boolean).join(' · ')}
                </Text>
              </Stack>
              <Box style={{minWidth: 150}}>
                <Text size={1} muted>
                  {item.actualStart ? `${watTime(item.actualStart)}–${item.actualEnd ? watTime(item.actualEnd) : 'now'}` : item.status === 'skipped' ? 'Skipped' : ''}
                </Text>
                {item.startDrift !== null ? (
                  <Text size={0} muted>
                    started {describeDrift(item.startDrift)}
                    {item.overrun ? `, ran ${item.overrun > 0 ? `${item.overrun} over` : `${-item.overrun} under`}` : ''}
                  </Text>
                ) : null}
              </Box>
              <Present documentId={item._id} documentType="programItem" />
              <Flex gap={1} onClick={(e) => e.stopPropagation()}>
                {item.status === 'upcoming' || item.status === 'skipped' ? (
                  <Button icon={iconFor(PlayIcon)} text="Start" mode="ghost" onClick={() => void start(item)} />
                ) : null}
                {item.status === 'running' ? (
                  <>
                    <Button icon={iconFor(StopIcon)} text="End" tone="primary" onClick={() => void end(item)} />
                    <Button icon={iconFor(Undo02Icon)} mode="bleed" title="Undo start" aria-label={`Undo start of ${item.title}`} onClick={() => void undoStart(item)} />
                  </>
                ) : null}
                {item.status === 'done' ? (
                  <Button icon={iconFor(Undo02Icon)} mode="bleed" title="Undo end" aria-label={`Undo end of ${item.title}`} onClick={() => void undoEnd(item)} />
                ) : null}
              </Flex>
            </Flex>
            {isSelected && item.notes ? (
              <Box paddingTop={3}>
                <Text size={1} muted>
                  {item.notes}
                </Text>
              </Box>
            ) : null}
          </Card>
        )
      })}
    </Stack>
  )
}

function Adjustments({programId, driftMinutes, canAsk}: {programId: string; driftMinutes: number; canAsk: boolean}) {
  const engine = useEngine()
  const {instances, loading} = useWorkflowInstances({engine, filter: {definition: 'live-adjustment', includeCompleted: true, limit: 6}})
  const [asking, setAsking] = useState(false)
  const all = [...(instances ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const open = all.filter((i) => !isFinished(i))
  const recent = all.filter((i) => isFinished(i)).slice(0, 3)
  const late = driftMinutes > DRIFT_ASK_AGENT_MINUTES

  return (
    <Stack gap={3}>
      <Flex gap={3} align="center" wrap="wrap">
        <Button
          icon={iconFor(AiMagicIcon)}
          text="Ask agent"
          tone="primary"
          disabled={!late || !canAsk || open.length > 0 || loading}
          onClick={() => setAsking(true)}
        />
        <Text size={1} muted>
          {open.length > 0
            ? 'The agent’s last proposal is still open below.'
            : !canAsk
              ? 'Every segment has started; there is nothing left to re-time.'
              : late
                ? `Running ${describeDrift(driftMinutes)}. The agent can propose a re-timing; you approve or reject it.`
                : `The agent can help once the program is more than ${DRIFT_ASK_AGENT_MINUTES} minutes late.`}
        </Text>
      </Flex>
      {open.map((instance) => (
        <AdjustmentCard key={instance._id} instance={instance} />
      ))}
      {recent.length ? (
        <Stack gap={2}>
          {recent.map((instance) => (
            <Text key={instance._id} size={1} muted>
              <Icon icon={Clock01Icon} size={12} /> Earlier adjustment, {new Date(instance.startedAt).toLocaleTimeString('en-GB', {timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit'})}:{' '}
              {stageTitle(instance)}
              {fieldValue<{reason?: string}>(instance, 'decision')?.reason ? ` (“${fieldValue<{reason?: string}>(instance, 'decision')?.reason}”)` : ''}
            </Text>
          ))}
        </Stack>
      ) : null}
      {asking ? <AskAgentDialog programId={programId} driftMinutes={driftMinutes} onClose={() => setAsking(false)} /> : null}
    </Stack>
  )
}

function AskAgentDialog({programId, driftMinutes, onClose}: {programId: string; driftMinutes: number; onClose: () => void}) {
  const id = useId()
  const engine = useEngine()
  const client = useClient({apiVersion: API_VERSION})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const documentId = crypto.randomUUID()
      await client.create({
        _id: documentId,
        _type: 'programAdjustment',
        program: {_type: 'reference', _ref: programId},
        driftMinutes,
        ...(note.trim() ? {note: note.trim()} : {}),
      })
      // Started as the signed-in coordinator; the agent picks up the queued work from here.
      await engine.startInstance({
        definition: 'live-adjustment',
        initialFields: [{type: 'subject', name: 'subject', value: refDataset({projectId: PROJECT_ID, dataset: CONTENT_DATASET, documentId, type: 'programAdjustment'})}],
      })
      onClose()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      id={id}
      header="Ask the agent to re-time the rest of the day"
      onClose={onClose}
      width={1}
      footer={
        <Flex justify="flex-end" gap={2} padding={3}>
          <Button mode="bleed" text="Cancel" onClick={onClose} />
          <Button tone="primary" text="Ask agent" loading={busy} disabled={busy} onClick={() => void ask()} />
        </Flex>
      }
    >
      <Box padding={4}>
        <Stack gap={4}>
          <Text size={1}>
            The program is running {describeDrift(driftMinutes)}. The agent will propose new times for the segments still to come. It can shorten
            segments but never reorders or drops them, and nothing changes until you approve.
          </Text>
          <Stack gap={2}>
            <Text as="label" htmlFor={`${id}-note`} size={1} weight="medium">
              Anything the agent should know (optional)
            </Text>
            <TextArea id={`${id}-note`} rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="For example: the MC says the speeches will run long." />
          </Stack>
          {error ? <Notice tone="critical">{error}</Notice> : null}
        </Stack>
      </Box>
    </Dialog>
  )
}

type Proposal = {
  summary: string | null
  appliedAt: string | null
  changes: {_key: string; title: string | null; fromStart: string; fromDuration: number; toStart: string; toDuration: number}[] | null
}

function AdjustmentCard({instance}: {instance: WorkflowInstance}) {
  const engine = useEngine()
  const session = useWorkflowSession({engine, instanceId: instance._id})
  const documentId = (instance.fields.find((f) => f.name === 'subject')?.value as {id?: string} | undefined)?.id?.split(':').at(-1) ?? ''
  const {data: proposal} = useQuery<Proposal | null>({
    query: `*[_id == $id][0]{summary, appliedAt, "changes": changes[]{_key, "title": item->title, fromStart, fromDuration, toStart, toDuration}}`,
    params: {id: documentId},
  })
  const current = session.evaluation?.instance ?? instance
  const problem = fieldValue<string>(current, 'problem')
  const changes = proposal?.changes ?? []
  const cut = changes.reduce((n, c) => n + c.fromDuration - c.toDuration, 0)
  const last = changes.at(-1)

  return (
    <Card padding={4} radius={2} border tone="primary">
      <ReportPresence documentId={documentId} documentType="programAdjustment" />
      <Stack gap={4}>
        <Flex gap={2} align="center">
          <Text size={2} weight="semibold">
            Live adjustment
          </Text>
          <Badge tone="primary">{stageTitle(current)}</Badge>
          <Box flex={1} />
          <Present documentId={documentId} documentType="programAdjustment" />
        </Flex>
        {current.currentStage === 'proposing' ? (
          <Loading label="The agent is working on a proposal. This needs `pnpm agent serve` running." />
        ) : null}
        {problem ? <Notice tone="critical">{problem}</Notice> : null}
        {changes.length ? (
          <Stack gap={3}>
            <Text size={1}>
              {changes.length} segments re-timed, {cut} minutes cut in total.
              {last ? ` The last changed segment now ends at ${watTime(new Date(new Date(last.toStart).getTime() + last.toDuration * 60_000))}.` : ''}
            </Text>
            <Stack gap={2}>
              {changes.map((c) => (
                <Flex key={c._key} gap={3}>
                  <Box style={{width: 150}}>
                    <Text size={1} muted>
                      {watTime(c.fromStart)} → <strong>{watTime(c.toStart)}</strong>
                    </Text>
                  </Box>
                  <Box flex={1}>
                    <Text size={1}>{c.title}</Text>
                  </Box>
                  <Text size={1} muted>
                    {c.toDuration === c.fromDuration ? `${c.toDuration} min` : `${c.fromDuration} → ${c.toDuration} min`}
                  </Text>
                </Flex>
              ))}
            </Stack>
            {proposal?.summary ? (
              <Card padding={3} radius={2} tone="transparent" border>
                <Stack gap={2}>
                  <Text size={0} muted>
                    The agent’s summary (its own words; the figures above are computed from the proposal)
                  </Text>
                  <Text size={1}>{proposal.summary}</Text>
                </Stack>
              </Card>
            ) : null}
          </Stack>
        ) : null}
        {session.ready && session.evaluation ? <ActionBar session={session} evaluation={session.evaluation} /> : null}
      </Stack>
    </Card>
  )
}
