import {SanityApp} from '@sanity/sdk-react'
import {Flex, Spinner} from '@sanity/ui'

import {sanityConfigs} from './config'
import {EventOverview} from './EventOverview'
import {SanityUI} from './SanityUI'

function Loading() {
  return (
    <Flex justify="center" align="center" height="fill" style={{minHeight: '100vh'}}>
      <Spinner muted />
    </Flex>
  )
}

export default function App() {
  return (
    <SanityUI>
      <SanityApp config={sanityConfigs} fallback={<Loading />}>
        <EventOverview />
      </SanityApp>
    </SanityUI>
  )
}
