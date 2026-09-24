import {Calendar03Icon, Ticket01Icon, Store01Icon, DressIcon} from '@hugeicons/core-free-icons'
import {HugeiconsIcon, type IconSvgElement} from '@hugeicons/react'
import {type DocumentHandle, useDocumentProjection, useDocuments} from '@sanity/sdk-react'
import {Box, Card, Container, Flex, Grid, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {Suspense} from 'react'

// Phase 1: prove the console boots inside the Dashboard and reads live content.
// The live program, approvals, aso ebi board and arrivals views come in Phase 4.

function Count({label, icon, documentType, filter}: {label: string; icon: IconSvgElement; documentType: string; filter?: string}) {
  const {count} = useDocuments({documentType, ...(filter ? {filter} : {}), batchSize: 1})
  return (
    <Card padding={4} radius={2} border>
      <Stack gap={3}>
        <Flex align="center" gap={2}>
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.6} />
          <Text size={1} muted>
            {label}
          </Text>
        </Flex>
        <Text size={4} weight="semibold">
          {count}
        </Text>
      </Stack>
    </Card>
  )
}

function EventHeading() {
  const {data: events} = useDocuments({documentType: 'event', batchSize: 1})
  const first = events[0]
  return first ? <EventTitle handle={first} /> : <Heading as="h1">No event yet</Heading>
}

function EventTitle({handle}: {handle: DocumentHandle}) {
  const {data} = useDocumentProjection<{title: string | null; date: string | null; city: string | null}>({
    ...handle,
    projection: '{title, date, city}',
  })
  return (
    <Stack gap={3}>
      <Heading as="h1" size={3}>
        {data?.title}
      </Heading>
      <Flex align="center" gap={2}>
        <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={1.6} />
        <Text muted>
          {data?.date} · {data?.city}
        </Text>
      </Flex>
    </Stack>
  )
}

export function EventOverview() {
  return (
    <Container width={3} paddingX={4} paddingY={5}>
      <Stack gap={5}>
        <Suspense fallback={<Spinner muted />}>
          <EventHeading />
        </Suspense>
        <Suspense fallback={<Spinner muted />}>
          <Grid gridTemplateColumns={[1, 2, 4]} gap={3}>
            <Count label="Guests attending" icon={Ticket01Icon} documentType="guest" filter='rsvp == "attending"' />
            <Count label="Awaiting RSVP" icon={Ticket01Icon} documentType="guest" filter='rsvp == "pending"' />
            <Count label="Vendors booked" icon={Store01Icon} documentType="vendor" />
            <Count label="Aso ebi lots" icon={DressIcon} documentType="asoEbiLot" />
          </Grid>
        </Suspense>
        <Box>
          <Text size={1} muted>
            Owambe Desk coordinator console. Live program, approvals, aso ebi and arrivals arrive in the next phases.
          </Text>
        </Box>
      </Stack>
    </Container>
  )
}
