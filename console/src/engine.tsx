import type {Engine} from '@sanity/workflow-engine'
import {useWorkflowEngine} from '@sanity/workflow-sdk'
import {createContext, type ReactNode, useContext} from 'react'

import {WORKFLOW_RESOURCE, WORKFLOW_TAG} from './config'

const EngineContext = createContext<Engine | null>(null)

/**
 * One engine for the whole console, bound to the signed-in user's App SDK client. Every
 * action fired from here is attributed to that person in workflow history.
 */
export function EngineProvider({children}: {children: ReactNode}) {
  const engine = useWorkflowEngine({workflowResource: WORKFLOW_RESOURCE, tag: WORKFLOW_TAG})
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
}

export function useEngine(): Engine {
  const engine = useContext(EngineContext)
  if (!engine) throw new Error('useEngine must be used inside <EngineProvider>')
  return engine
}
