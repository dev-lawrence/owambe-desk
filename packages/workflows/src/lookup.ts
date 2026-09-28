import type {Engine, WorkflowInstance} from '@sanity/workflow-engine'

/** The newest unfinished instance of `definition` whose subject is the given global document reference. */
export async function findOpenInstance(engine: Engine, definition: string, subjectId: string): Promise<WorkflowInstance | null> {
  const ids = await engine.query<string[]>({
    groq: `*[_type == "sanity.workflow.instance" && tag == $tag && definition == $definition
       && !defined(completedAt) && count(fields[name == "subject" && value.id == $subject]) > 0]
       | order(startedAt desc)._id`,
    params: {definition, subject: subjectId},
  })
  const [id] = ids
  return id ? engine.getInstance({instanceId: id}) : null
}
