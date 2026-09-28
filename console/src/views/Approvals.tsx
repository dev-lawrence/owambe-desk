import {Badge, Box, Card, Flex, Stack, Text} from '@sanity/ui'
import type {WorkflowInstance} from '@sanity/workflow-engine'
import {useWorkflowInstances} from '@sanity/workflow-sdk'
import {useState} from 'react'

import {ago, errorText, Loading, Notice, useNow} from '../components/common'
import {SubjectLabel} from '../components/Subject'
import {WorkflowDetail} from '../components/WorkflowDetail'
import {useEngine} from '../engine'
import {isFinished, stageTitle, waitingOn} from '../lib/workflow'

const GROUPS = [
  {definition: 'program-approval', title: 'Program of events'},
  {definition: 'live-adjustment', title: 'Live adjustments'},
  {definition: 'aso-ebi-order', title: 'Aso ebi orders'},
]

function Row({instance, selected, onSelect}: {instance: WorkflowInstance; selected: boolean; onSelect: () => void}) {
  const now = useNow(60_000)
  const waiting = waitingOn(instance)
  const finished = isFinished(instance)
  return (
    <Card as="button" padding={3} radius={2} border selected={selected} onClick={onSelect} style={{textAlign: 'left', width: '100%'}}>
      <Stack gap={2}>
        <Flex gap={2} align="center">
          <Box flex={1} style={{minWidth: 0}}>
            <SubjectLabel instance={instance} />
          </Box>
          <Badge tone={finished ? 'default' : waiting.length ? 'caution' : 'primary'}>{stageTitle(instance)}</Badge>
        </Flex>
        <Text size={0} muted>
          {finished ? `Finished ${ago(instance.completedAt ?? instance.lastChangedAt, now)}` : waiting.length ? `Waiting on ${waiting.join(', ')}` : 'Not waiting on anyone'}
          {' · '}changed {ago(instance.lastChangedAt, now)}
        </Text>
      </Stack>
    </Card>
  )
}

export function Approvals() {
  const engine = useEngine()
  const {instances, loading, unreadable, error} = useWorkflowInstances({engine, filter: {includeCompleted: true}})
  const [selected, setSelected] = useState<string | null>(null)
  const [showFinished, setShowFinished] = useState(false)

  if (error) return <Notice tone="critical">Could not load workflows: {errorText(error)}</Notice>
  if (loading || !instances) return <Loading label="Loading workflows" />

  const visible = instances.filter((i) => showFinished || !isFinished(i))
  const finishedCount = instances.length - instances.filter((i) => !isFinished(i)).length

  return (
    <Box style={{display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 32}}>
      <Stack gap={5}>
        {unreadable.length ? <Notice>{unreadable.length} workflow document(s) could not be read with your access.</Notice> : null}
        {GROUPS.map((group) => {
          const rows = visible
            .filter((i) => i.definition === group.definition)
            .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt))
          return (
            <Stack key={group.definition} gap={3}>
              <Text size={1} weight="semibold">
                {group.title} ({rows.length})
              </Text>
              {rows.length ? (
                rows.map((instance) => (
                  <Row key={instance._id} instance={instance} selected={selected === instance._id} onSelect={() => setSelected(instance._id)} />
                ))
              ) : (
                <Text size={1} muted>
                  None in progress.
                </Text>
              )}
            </Stack>
          )
        })}
        {finishedCount ? (
          <Card as="button" padding={2} radius={2} tone="transparent" onClick={() => setShowFinished((v) => !v)} style={{textAlign: 'left'}}>
            <Text size={1} muted>
              {showFinished ? 'Hide' : 'Show'} {finishedCount} finished workflow(s)
            </Text>
          </Card>
        ) : null}
      </Stack>
      <Box>
        {selected ? (
          <Card padding={4} radius={2} border>
            <WorkflowDetail key={selected} instanceId={selected} subject={<SubjectLabel instance={instances.find((i) => i._id === selected)!} size={2} />} />
          </Card>
        ) : (
          <Text size={1} muted>
            Choose a workflow to see where it is, who it is waiting on, and everything that has happened to it.
          </Text>
        )}
      </Box>
    </Box>
  )
}
