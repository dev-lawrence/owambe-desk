import {useSanityInstance} from '@sanity/sdk-react'
import {Badge, Box, Card, Flex, Stack, Text} from '@sanity/ui'
import {WorkflowDiagram} from '@sanity/workflow-diagram'
import type {WorkflowInstance} from '@sanity/workflow-engine'
import {sdkProjectUserDirectory, useWorkflowSession} from '@sanity/workflow-sdk'
import {type ReactNode, useEffect, useMemo, useState} from 'react'

import {PROJECT_ID} from '../config'
import {useEngine} from '../engine'
import {actorLabel, stageTitle, timeline, waitingOn} from '../lib/workflow'
import {ActionBar} from './Actions'
import {ago, errorText, Loading, Notice, useNow} from './common'

/** Resolve people's account ids to names through the project's user directory. Robots are labelled elsewhere. */
export function usePeopleNames(ids: readonly string[]): Map<string, string> {
  const sdk = useSanityInstance()
  const directory = useMemo(() => sdkProjectUserDirectory(sdk, PROJECT_ID), [sdk])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const wanted = [...new Set(ids)].filter((id) => !id.startsWith('g-') && !id.startsWith('p-')).sort().join(',')

  useEffect(() => {
    let cancelled = false
    const todo = wanted ? wanted.split(',') : []
    void Promise.all(
      todo.map(async (id) => {
        const found = await directory.findById(id).catch(() => null)
        return found?.status === 'resolved' ? ([id, found.user.profile.displayName] as const) : null
      }),
    ).then((pairs) => {
      if (!cancelled) setNames(new Map(pairs.filter((p): p is readonly [string, string] => p !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [directory, wanted])
  return names
}

export function Timeline({instance}: {instance: WorkflowInstance}) {
  const now = useNow(60_000)
  const rows = timeline(instance)
  const names = usePeopleNames(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))
  return (
    <Stack as="ol" gap={3} style={{listStyle: 'none', margin: 0, padding: 0}}>
      {rows.map((row) => (
        <Flex as="li" key={row.key} gap={3} align="flex-start">
          <Box style={{minWidth: 84}}>
            <Text size={1} muted title={row.at}>
              {ago(row.at, now)}
            </Text>
          </Box>
          <Stack gap={2} flex={1}>
            <Text size={1} weight={row.tone === 'positive' ? 'medium' : 'regular'}>
              {row.text}
            </Text>
            <Text size={0} muted>
              {actorLabel(row.entry as Parameters<typeof actorLabel>[0], row.actorId ? names.get(row.actorId) : undefined)}
            </Text>
          </Stack>
        </Flex>
      ))}
    </Stack>
  )
}

const RECORD_SKIP = new Set(['subject'])

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value).toLocaleString('en-GB', {timeZone: 'Africa/Lagos'}) : value
  if (typeof value === 'object' && 'id' in (value as object)) return String((value as {id: string}).id)
  return JSON.stringify(value)
}

/** The workflow's own fields: decisions, reasons, payments, hand-offs. What happened, in the engine's words. */
function WorkflowRecord({instance}: {instance: WorkflowInstance}) {
  const fields = instance.fields.filter((f) => !RECORD_SKIP.has(f.name) && f.value !== null && f.value !== undefined && !(Array.isArray(f.value) && f.value.length === 0))
  const names = usePeopleNames(
    fields.flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value])).flatMap((v) => {
      const by = (v as {by?: {id?: string}; actor?: {id?: string}} | null)?.by ?? (v as {actor?: {id?: string}} | null)?.actor
      return by?.id ? [by.id] : []
    }),
  )
  if (fields.length === 0) return null
  const who = (v: {by?: {id: string}; actor?: {id: string}}) => {
    const id = v.by?.id ?? v.actor?.id
    return id ? (names.get(id) ?? (id.startsWith('g-') || id.startsWith('p-') ? `robot ${id}` : id)) : null
  }
  return (
    <Stack gap={3}>
      {fields.map((field) => {
        const rows = (Array.isArray(field.value) ? field.value : [field.value]) as Record<string, unknown>[]
        return (
          <Stack key={field.name} gap={2}>
            <Text size={1} weight="medium">
              {field.title ?? field.name}
            </Text>
            {rows.map((row, i) =>
              typeof row === 'object' && row !== null ? (
                <Card key={i} padding={2} radius={2} tone="transparent" border>
                  <Stack gap={2}>
                    {Object.entries(row)
                      .filter(([k]) => !['_key', '_type', 'by', 'actor'].includes(k))
                      .map(([k, v]) => (
                        <Text key={k} size={1}>
                          <span style={{opacity: 0.6}}>{k}: </span>
                          {show(v)}
                        </Text>
                      ))}
                    {who(row as {by?: {id: string}}) ? (
                      <Text size={0} muted>
                        by {who(row as {by?: {id: string}})}
                      </Text>
                    ) : null}
                  </Stack>
                </Card>
              ) : (
                <Text key={i} size={1}>
                  {show(row)}
                </Text>
              ),
            )}
          </Stack>
        )
      })}
    </Stack>
  )
}

/** One workflow instance, live: where it is, what the signed-in person can do, and what happened. */
export function WorkflowDetail({instanceId, subject}: {instanceId: string; subject?: ReactNode}) {
  const engine = useEngine()
  const session = useWorkflowSession({engine, instanceId})

  if (session.invalid) return <Notice tone="critical">This workflow cannot be read: {session.invalid.reason}</Notice>
  if (session.error) return <Notice tone="critical">Could not load this workflow: {errorText(session.error)}</Notice>
  if (!session.ready || !session.evaluation) return <Loading label="Loading workflow" />

  const {evaluation} = session
  const instance = evaluation.instance
  const waiting = waitingOn(instance)
  return (
    <Stack gap={4}>
      {session.evaluationError ? <Notice tone="caution">Showing the last good state; the latest evaluation failed: {errorText(session.evaluationError)}</Notice> : null}
      <Stack gap={3}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text size={2} weight="semibold">
            {evaluation.definition.title ?? instance.definition}
          </Text>
          <Badge tone={instance.completedAt ? 'positive' : 'primary'}>{stageTitle(instance)}</Badge>
        </Flex>
        {subject}
        <Text size={1} muted>
          {instance.completedAt ? 'Finished.' : waiting.length ? `Waiting on: ${waiting.join(', ')}` : 'Not waiting on anyone.'}
        </Text>
      </Stack>
      <ActionBar session={session} evaluation={evaluation} />
      <Card border radius={2} overflow="hidden">
        <WorkflowDiagram key={instance._id} definition={evaluation.definition} currentStage={instance.currentStage} history={instance.history} height={240} static explain evaluation={evaluation} />
      </Card>
      <WorkflowRecord instance={instance} />
      <Stack gap={3}>
        <Text size={1} weight="medium">
          History
        </Text>
        <Timeline instance={instance} />
      </Stack>
    </Stack>
  )
}
