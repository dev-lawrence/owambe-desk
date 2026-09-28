import {Clock01Icon, ShoppingBag01Icon, TaskDaily01Icon, UserGroupIcon} from '@hugeicons/core-free-icons'
import {SanityApp} from '@sanity/sdk-react'
import {Box, Container, Flex, Spinner, Stack, Tab, TabList, TabPanel} from '@sanity/ui'
import {WorkflowTelemetryProvider} from '@sanity/workflow-sdk'
import {useEffect, useState} from 'react'

import {iconFor} from './components/common'
import {sanityConfigs} from './config'
import {EngineProvider} from './engine'
import {EventOverview} from './EventOverview'
import {SanityUI} from './SanityUI'
import {Approvals} from './views/Approvals'
import {Arrivals} from './views/Arrivals'
import {AsoEbiBoard} from './views/AsoEbiBoard'
import {LiveProgram} from './views/LiveProgram'

function Loading() {
  return (
    <Flex justify="center" align="center" height="fill" style={{minHeight: '100vh'}}>
      <Spinner muted />
    </Flex>
  )
}

const TABS = [
  {id: 'live', title: 'Live program', icon: Clock01Icon, render: () => <LiveProgram />},
  {id: 'approvals', title: 'Approvals', icon: TaskDaily01Icon, render: () => <Approvals />},
  {id: 'aso-ebi', title: 'Aso ebi', icon: ShoppingBag01Icon, render: () => <AsoEbiBoard />},
  {id: 'arrivals', title: 'Arrivals', icon: UserGroupIcon, render: () => <Arrivals />},
] as const

function Console() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('live')
  // Each tab can be a different height; without this, switching tabs keeps whatever
  // scroll offset the previous (often taller) tab had, landing you mid-page with a
  // confusing blank gap above the new tab's content.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [active])
  return (
    <Container width={4} paddingX={4} paddingY={5}>
      <Stack gap={5}>
        <EventOverview />
        <TabList gap={2}>
          {TABS.map((tab) => (
            <Tab
              key={tab.id}
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              icon={iconFor(tab.icon)}
              label={tab.title}
              selected={active === tab.id}
              onClick={() => setActive(tab.id)}
            />
          ))}
        </TabList>
        {TABS.map((tab) => (
          <TabPanel key={tab.id} id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id}>
            {active === tab.id ? <Box paddingTop={2}>{tab.render()}</Box> : null}
          </TabPanel>
        ))}
      </Stack>
    </Container>
  )
}

export default function App() {
  return (
    <SanityUI>
      <SanityApp config={sanityConfigs} fallback={<Loading />}>
        <WorkflowTelemetryProvider>
          <EngineProvider>
            <Console />
          </EngineProvider>
        </WorkflowTelemetryProvider>
      </SanityApp>
    </SanityUI>
  )
}
