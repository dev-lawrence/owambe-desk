import {useCurrentUser} from '@sanity/sdk-react'
import {Box, Button, Card, Dialog, Flex, Select, Stack, Text, TextArea, TextInput} from '@sanity/ui'
import {actionRendering, type ActionEvaluation, type ActivityEvaluation, type WorkflowEvaluation} from '@sanity/workflow-engine'
import type {WorkflowSession} from '@sanity/workflow-sdk'
import {useId, useState} from 'react'

import {errorText} from './common'

type Param = {
  type: string
  name: string
  title?: string
  description?: string
  required?: boolean
  validation?: {min?: number; max?: number}
  options?: {list?: {title: string; value: string}[]}
}

function paramsOf(action: ActionEvaluation): Param[] {
  return ((action.action as {params?: Param[]}).params ?? []).filter((p) => p.type === 'string')
}

/** Why an action cannot be taken right now, in words a coordinator can act on. */
function blockedBecause(action: ActionEvaluation, activity: ActivityEvaluation): string | null {
  const reason = action.disabledReason
  if (!reason) return null
  switch (reason.kind) {
    case 'requirements-unmet':
      return activity.unmetRequirements?.map((r) => r.title ?? r.name).join('; ') ?? 'A requirement is not met.'
    case 'activity-not-active':
      return 'Already done in this stage.'
    case 'stage-terminal':
    case 'instance-completed':
    case 'instance-aborted':
      return 'This workflow has finished.'
    default:
      return 'Not available to you right now.'
  }
}

/**
 * Every action the signed-in person can see for the current stage, from the engine's own
 * evaluation. Actions only a robot may fire (Bachs, the web server) are absent, not greyed out.
 */
export function ActionBar({session, evaluation}: {session: WorkflowSession; evaluation: WorkflowEvaluation}) {
  const [open, setOpen] = useState<{activity: string; action: ActionEvaluation} | null>(null)
  const rows = evaluation.currentStage.activities
    .filter((a) => !a.scopedOut)
    .flatMap((activity) => activity.actions.map((action) => ({activity, action, rendering: actionRendering(action)})))
    .filter((r) => r.rendering === 'button')

  if (rows.length === 0) return null
  return (
    <>
      <Flex gap={2} wrap="wrap">
        {rows.map(({activity, action}) => {
          const blocked = blockedBecause(action, activity)
          return (
            <Stack key={`${activity.activity.name}.${action.action.name}`} gap={2}>
              <Button
                mode={action.semantics?.includes('decision.decline') ? 'ghost' : 'default'}
                tone={action.semantics?.includes('decision.decline') ? 'critical' : 'primary'}
                text={action.action.title ?? action.action.name}
                disabled={!action.allowed}
                onClick={() => setOpen({activity: activity.activity.name, action})}
              />
              {blocked ? (
                <Text size={0} muted>
                  {blocked}
                </Text>
              ) : null}
            </Stack>
          )
        })}
      </Flex>
      {open ? <ActionDialog session={session} activity={open.activity} action={open.action} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

function ActionDialog({session, activity, action, onClose}: {session: WorkflowSession; activity: string; action: ActionEvaluation; onClose: () => void}) {
  const id = useId()
  const user = useCurrentUser()
  const params = paramsOf(action)
  const [values, setValues] = useState<Record<string, string>>(() =>
    // The coordinator is acting for themselves: fill in their name. Family approvals name the family's approver, so stay empty.
    Object.fromEntries(params.map((p) => [p.name, p.name === 'onBehalfOf' && p.title === 'Coordinator' ? (user?.name ?? '') : ''])),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const problems = params.flatMap((p) => {
    const value = (values[p.name] ?? '').trim()
    if (!value) return p.required ? [`${p.title ?? p.name} is required.`] : []
    if (p.validation?.min && value.length < p.validation.min) return [`${p.title ?? p.name} needs at least ${p.validation.min} characters.`]
    if (p.validation?.max && value.length > p.validation.max) return [`${p.title ?? p.name} is too long.`]
    return []
  })

  async function fire() {
    setBusy(true)
    setError(null)
    try {
      const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''))
      await session.fireAction({activity, action: action.action.name, params: trimmed})
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
      header={action.action.title ?? action.action.name}
      onClose={onClose}
      width={1}
      footer={
        <Flex justify="flex-end" gap={2} padding={3}>
          <Button mode="bleed" text="Cancel" onClick={onClose} />
          <Button tone="primary" text={action.action.title ?? 'Confirm'} loading={busy} disabled={busy || problems.length > 0} onClick={() => void fire()} />
        </Flex>
      }
    >
      <Box padding={4}>
        <Stack gap={4}>
          {action.action.description ? <Text size={1}>{action.action.description}</Text> : null}
          {params.map((p) => {
            const inputId = `${id}-${p.name}`
            const set = (value: string) => setValues((v) => ({...v, [p.name]: value}))
            return (
              <Stack key={p.name} gap={2}>
                <Text as="label" htmlFor={inputId} size={1} weight="medium">
                  {p.title ?? p.name}
                  {p.required ? '' : ' (optional)'}
                </Text>
                {p.description ? (
                  <Text size={1} muted>
                    {p.description}
                  </Text>
                ) : null}
                {p.options?.list ? (
                  <Select id={inputId} value={values[p.name]} onChange={(e) => set(e.currentTarget.value)}>
                    <option value="">Choose…</option>
                    {p.options.list.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.title}
                      </option>
                    ))}
                  </Select>
                ) : (p.validation?.max ?? 0) > 200 || p.name === 'reason' ? (
                  <TextArea id={inputId} rows={3} value={values[p.name]} onChange={(e) => set(e.currentTarget.value)} />
                ) : (
                  <TextInput id={inputId} value={values[p.name]} onChange={(e) => set(e.currentTarget.value)} />
                )}
              </Stack>
            )
          })}
          {error ? (
            <Card padding={3} radius={2} tone="critical" role="alert">
              <Text size={1}>{error}</Text>
            </Card>
          ) : null}
        </Stack>
      </Box>
    </Dialog>
  )
}
