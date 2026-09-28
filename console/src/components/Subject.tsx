import {useDocumentProjection} from '@sanity/sdk-react'
import {Text} from '@sanity/ui'
import type {WorkflowInstance} from '@sanity/workflow-engine'
import {Suspense} from 'react'

import {subjectId} from '../lib/workflow'

const SUBJECTS: Record<string, {type: string; projection: string; label: (d: Record<string, unknown>) => string}> = {
  'program-approval': {
    type: 'programOfEvents',
    projection: '{version, "count": count(items)}',
    label: (d) => `Program of events, version ${d.version ?? '?'} (${d.count ?? 0} segments)`,
  },
  'aso-ebi-order': {
    type: 'asoEbiOrder',
    projection: '{quantity, "guest": guest->person->name, "colour": lot->colourName}',
    label: (d) => `${d.guest ?? 'Unknown guest'} · ${d.quantity ?? '?'} × ${d.colour ?? 'fabric'}`,
  },
  'live-adjustment': {
    type: 'programAdjustment',
    projection: '{driftMinutes, "changes": count(changes)}',
    label: (d) => `Asked at ${d.driftMinutes ?? '?'} min late${d.changes ? `, ${d.changes} segments re-timed` : ''}`,
  },
}

function Label({documentId, definition}: {documentId: string; definition: string}) {
  const spec = SUBJECTS[definition]!
  const {data} = useDocumentProjection<Record<string, unknown>>({documentId, documentType: spec.type, projection: spec.projection})
  return <>{data ? spec.label(data) : 'Deleted document'}</>
}

/** A one-line description of what a workflow is about, read live from its subject document. */
export function SubjectLabel({instance, size = 1}: {instance: WorkflowInstance; size?: number}) {
  const id = subjectId(instance)
  const known = SUBJECTS[instance.definition]
  return (
    <Text size={size} textOverflow="ellipsis">
      {id && known ? (
        <Suspense fallback="…">
          <Label documentId={id} definition={instance.definition} />
        </Suspense>
      ) : (
        (id ?? instance._id)
      )}
    </Text>
  )
}
