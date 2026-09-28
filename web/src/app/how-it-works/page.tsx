import 'server-only'

import {watDate, watTime} from '@owambe/shared'
import type {Metadata} from 'next'
import {createClient} from 'next-sanity'

import {readableHistory, whoCanAct, type HistoryEvent, type Step} from '@/lib/workflow/history'
import {apiVersion, dataset, projectId} from '@/sanity/env'

export const metadata: Metadata = {title: 'How it works · Owambe Desk'}
// Workflow documents are not public, so this page reads them with a server token and refreshes each minute.
export const revalidate = 60

type Action = {name: string; title?: string; filter?: string}
type Stage = {
  name: string
  title?: string
  description?: string
  activities?: {name: string; title?: string; actions?: Action[]}[]
  transitions?: {name: string; title?: string; to: string}[]
}
type Definition = {name: string; title: string; description?: string; version: number; stages: Stage[]}
type Instance = {
  _id: string
  definition: string
  currentStage: string
  startedAt: string
  completedAt?: string
  definitionSnapshot: string
  subjectId?: string
  history: HistoryEvent[]
}

// Written in the brief's order; any other workflow found in the dataset is shown after these.
const ORDER = ['program-approval', 'aso-ebi-order', 'live-adjustment']
const AGENT_CONTEXT = 'owambe-agent'

async function load() {
  const token = process.env.SANITY_API_READ_TOKEN
  if (!token) return null
  const client = createClient({projectId, dataset, apiVersion, token, useCdn: false, perspective: 'published'})
  const {definitions, instances} = await client.fetch<{definitions: Definition[]; instances: Instance[]}>(
    `{
      "definitions": *[_type == "sanity.workflow.definition"]{name, title, description, version, stages},
      "instances": *[_type == "sanity.workflow.instance"] | order(startedAt desc){
        _id, definition, currentStage, startedAt, completedAt, definitionSnapshot,
        "subjectId": fields[name == "subject"][0].value.id,
        history
      }
    }`,
    {},
    {tag: 'owambe.how-it-works'},
  )
  const subjectIds = instances.flatMap((i) => (i.subjectId ? [i.subjectId.split(':').at(-1)!] : []))
  const subjects = await client.fetch<{_id: string; label: string}[]>(
    `*[_id in $ids]{_id, "label": select(
      _type == "programOfEvents" => "Program of events, version " + string(version),
      _type == "asoEbiOrder" => string(quantity) + " × " + lot->colourName + " aso ebi",
      _type == "programAdjustment" => "Re-timing the day, " + string(driftMinutes) + " min late",
      _type
    )}`,
    {ids: subjectIds},
  )
  const latest = new Map<string, Definition>()
  for (const definition of definitions) {
    if ((latest.get(definition.name)?.version ?? -1) < definition.version) latest.set(definition.name, definition)
  }
  const sorted = [...latest.values()].sort((a, b) => rank(a.name) - rank(b.name))
  return {definitions: sorted, instances, subjects: new Map(subjects.map((s) => [s._id, s.label]))}
}

const rank = (name: string) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length)

export default async function HowItWorksPage() {
  const data = await load()

  return (
    <main className="mx-auto max-w-6xl px-5 pt-16 pb-24 sm:px-8 sm:pt-20">
      <h1 className="text-headline font-semibold">How it works</h1>
      <div className="mt-6 grid max-w-3xl gap-4 text-lg text-ink-soft">
        <p>
          A wedding like this already runs on approvals. Both families must agree on the program before it is printed.
          Guests pay for aso ebi before it goes to the tailor. On the day, the coordinator keeps the program moving.
        </p>
        <p>
          Owambe Desk writes those processes down as Sanity Workflows, stored next to the content they move. An AI agent
          drafts and proposes; people approve or reject; a payment webhook confirms money. They all go through the same
          transitions, and the rules about who may do what are part of each workflow, not just the buttons.
        </p>
        <p>Everything below is read from the live dataset: the deployed definitions, then every run with its real history.</p>
      </div>

      {!data ? (
        <p className="mt-12 rounded-md border border-line p-5">This copy of the site has no read token, so it cannot show workflow history.</p>
      ) : (
        data.definitions.map((definition) => (
          <Workflow
            key={definition.name}
            definition={definition}
            instances={data.instances.filter((i) => i.definition === definition.name)}
            subjects={data.subjects}
          />
        ))
      )}
    </main>
  )
}

function Workflow({definition, instances, subjects}: {definition: Definition; instances: Instance[]; subjects: Map<string, string>}) {
  const stageTitle = (name?: string) => definition.stages.find((s) => s.name === name)?.title ?? name ?? ''

  return (
    <section aria-labelledby={definition.name} className="mt-20 border-t border-ink pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id={definition.name} className="text-3xl font-semibold tracking-tight">
          {definition.title}
        </h2>
        <p className="tabular text-sm text-ink-soft">Definition version {definition.version}</p>
      </div>
      {definition.description ? <p className="mt-3 max-w-3xl text-ink-soft">{definition.description}</p> : null}

      <h3 className="mt-10 text-lg font-semibold">The stages</h3>
      <ol className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
        {definition.stages.map((stage, index) => (
          <li key={stage.name} className="bg-paper p-5">
            <p className="tabular text-sm text-ink-soft">{index + 1}</p>
            <p className="text-lg font-semibold">{stage.title ?? stage.name}</p>
            {stage.description ? <p className="mt-1 text-sm text-ink-soft">{stage.description}</p> : null}
            {stage.activities?.flatMap((a) => a.actions ?? []).length ? (
              <ul className="mt-4 grid gap-1.5 text-sm">
                {stage.activities.flatMap((activity) =>
                  (activity.actions ?? []).map((action) => (
                    <li key={`${activity.name}.${action.name}`} className="flex justify-between gap-3 border-t border-line pt-1.5">
                      <span>
                        {action.title ?? action.name}
                        {stage.activities!.length > 1 ? <span className="text-ink-soft"> ({activity.title})</span> : null}
                      </span>
                      <span className="shrink-0 text-ink-soft">{whoCanAct(action.filter)}</span>
                    </li>
                  )),
                )}
              </ul>
            ) : null}
            {stage.transitions?.length ? (
              <ul className="mt-4 grid gap-1 text-sm text-ink-soft">
                {stage.transitions.map((t) => (
                  <li key={t.name}>
                    <span aria-hidden="true">→ </span>
                    {t.title ?? t.name}: <span className="text-ink">{stageTitle(t.to)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      <h3 className="mt-12 text-lg font-semibold">
        What actually happened <span className="tabular font-normal text-ink-soft">({instances.length} {instances.length === 1 ? 'run' : 'runs'})</span>
      </h3>
      {instances.length === 0 ? <p className="mt-3 text-ink-soft">No runs of this workflow yet.</p> : null}
      {instances.map((instance) => (
        <Run key={instance._id} instance={instance} subject={subjects.get(instance.subjectId?.split(':').at(-1) ?? '')} />
      ))}
    </section>
  )
}

function Run({instance, subject}: {instance: Instance; subject?: string}) {
  // Each run is read against the version it was pinned to, so old runs keep their own stage names.
  const snapshot = JSON.parse(instance.definitionSnapshot) as Definition
  const stage = (name?: string) => snapshot.stages.find((s) => s.name === name)
  const agentIds = new Set(instance.history.filter((e) => e.executionContext?.id === AGENT_CONTEXT).flatMap((e) => (e.actor?.id ? [e.actor.id] : [])))
  const steps = readableHistory(
    instance.history,
    {
      stage: (name) => stage(name)?.title ?? name ?? '',
      action: (stageName, activity, action) => {
        const act = stage(stageName)?.activities?.find((a) => a.name === activity) ?? stage(stageName)?.activities?.find((a) => a.actions?.some((x) => x.name === action))
        const title = act?.actions?.find((x) => x.name === action)?.title ?? action ?? ''
        return (stage(stageName)?.activities?.length ?? 0) > 1 && act?.title ? `${title} (${act.title})` : title
      },
    },
    agentIds,
  )

  return (
    <details className="group mt-4 rounded-lg border border-line open:pb-2">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-5">
        <span className="font-medium">{subject ?? 'A run'}</span>
        <span className="tabular text-sm text-ink-soft">
          started {watDate(instance.startedAt)} {watTime(instance.startedAt)} · now <span className="text-ink">{stage(instance.currentStage)?.title ?? instance.currentStage}</span> ·{' '}
          {steps.length} steps
        </span>
      </summary>
      <ol className="mx-5 border-l border-line">
        {steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ol>
    </details>
  )
}

function StepRow({step}: {step: Step}) {
  const dot = step.kind === 'agent' ? 'bg-accent' : step.kind === 'person' ? 'bg-ink' : 'bg-line'
  return (
    <li className="relative grid gap-0.5 py-3 pl-6 sm:grid-cols-[7rem_1fr]">
      <span aria-hidden="true" className={`absolute top-[1.15rem] -left-[5px] size-[9px] rounded-full ${dot}`} />
      <span className="tabular text-sm text-ink-soft">
        {watDate(step.at).slice(5)} {watTime(step.at)}
      </span>
      <span>
        <span className={step.kind === 'system' ? 'text-ink-soft' : ''}>
          <span className="font-medium">{step.who}</span>: {step.what}
        </span>
        {step.detail ? <span className="mt-1 block max-w-3xl border-l-2 border-line pl-3 text-ink-soft">{step.detail}</span> : null}
      </span>
    </li>
  )
}
