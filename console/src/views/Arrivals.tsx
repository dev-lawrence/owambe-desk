import {Tick02Icon, Undo02Icon} from '@hugeicons/core-free-icons'
import {VENDOR_CATEGORIES, watTime} from '@owambe/shared'
import {editDocument, useApplyDocumentActions, useQuery} from '@sanity/sdk-react'
import {Badge, Box, Button, Card, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {Suspense, useDeferredValue, useId, useState} from 'react'

import {errorText, iconFor, Loading, Notice} from '../components/common'
import {Present, ReportPresence} from '../components/Presence'

type Guest = {_id: string; name: string | null; inviteCode: string; table: string | null; seats: number | null; rsvp: string; checkedInAt: string | null; side: string | null}
type Vendor = {_id: string; name: string; category: string; contact: string | null; arrivedAt: string | null}

// Name words or the invite code. `match` is prefix-aware per word, so "fem" finds "Femi Adeyemi".
const GUESTS_QUERY = `*[_type == "guest" && !(_id in path("drafts.**")) && ($q == "" || person->name match $pattern || inviteCode match $pattern)]
  | order(person->name asc)[0...60]{_id, "name": person->name, inviteCode, table, seats, rsvp, checkedInAt, "side": person->side}`
const COUNTS_QUERY = `{
  "attending": count(*[_type == "guest" && rsvp == "attending" && !(_id in path("drafts.**"))]),
  "arrived": count(*[_type == "guest" && defined(checkedInAt) && !(_id in path("drafts.**"))]),
  "seatsArrived": math::sum(*[_type == "guest" && defined(checkedInAt) && !(_id in path("drafts.**"))].seats)
}`
const VENDORS_QUERY = `*[_type == "vendor" && !(_id in path("drafts.**"))] | order(name asc){_id, name, category, "contact": contact->name, arrivedAt}`

const SIDE: Record<string, string> = {bride: 'Bride', groom: 'Groom', couple: 'Couple', neutral: ''}
const liveHandle = (documentId: string, documentType: string) => ({documentId, documentType, liveEdit: true})

function useStamp() {
  const apply = useApplyDocumentActions()
  const [error, setError] = useState<string | null>(null)
  const stamp = async (documentId: string, documentType: string, field: string, on: boolean) => {
    setError(null)
    try {
      await apply([editDocument(liveHandle(documentId, documentType), on ? {set: {[field]: new Date().toISOString()}} : {unset: [field]})])
    } catch (cause) {
      setError(errorText(cause))
    }
  }
  return {stamp, error}
}

function Counts() {
  const {data} = useQuery<{attending: number; arrived: number; seatsArrived: number | null}>({query: COUNTS_QUERY})
  return (
    <Text size={1} muted>
      {data.arrived} of {data.attending} attending guests have arrived ({data.seatsArrived ?? 0} seats).
    </Text>
  )
}

function GuestList({q}: {q: string}) {
  const term = q.trim()
  const {data: guests} = useQuery<Guest[]>({query: GUESTS_QUERY, params: {q: term, pattern: `${term}*`}})
  const {stamp, error} = useStamp()
  const [focused, setFocused] = useState<string | null>(null)

  return (
    <Stack gap={2}>
      {error ? <Notice tone="critical">Could not save: {error}</Notice> : null}
      {guests.length === 0 ? (
        <Text size={1} muted>
          No guest matches “{term}”.
        </Text>
      ) : null}
      {guests.map((guest) => (
        <Card
          key={guest._id}
          padding={3}
          radius={2}
          border
          tone={guest.checkedInAt ? 'positive' : 'default'}
          onFocusCapture={() => setFocused(guest._id)}
          onMouseEnter={() => setFocused(guest._id)}
        >
          {focused === guest._id ? <ReportPresence documentId={guest._id} documentType="guest" /> : null}
          <Flex gap={3} align="center" wrap="wrap">
            <Stack gap={2} flex={1} style={{minWidth: 180}}>
              <Text size={1} weight="medium">
                {guest.name}
              </Text>
              <Text size={0} muted>
                {[guest.inviteCode, guest.table ? `Table ${guest.table}` : 'No table', guest.seats && guest.seats > 1 ? `admits ${guest.seats}` : null, SIDE[guest.side ?? '']]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Stack>
            {guest.rsvp !== 'attending' ? <Badge tone={guest.rsvp === 'declined' ? 'critical' : 'caution'}>RSVP {guest.rsvp}</Badge> : null}
            <Present documentId={guest._id} documentType="guest" />
            {guest.checkedInAt ? (
              <Flex gap={1} align="center">
                <Text size={1}>Arrived {watTime(guest.checkedInAt)}</Text>
                <Button icon={iconFor(Undo02Icon)} mode="bleed" aria-label={`Undo check-in for ${guest.name}`} title="Undo check-in" onClick={() => void stamp(guest._id, 'guest', 'checkedInAt', false)} />
              </Flex>
            ) : (
              <Button icon={iconFor(Tick02Icon)} text="Check in" tone="primary" onClick={() => void stamp(guest._id, 'guest', 'checkedInAt', true)} />
            )}
          </Flex>
        </Card>
      ))}
    </Stack>
  )
}

function Vendors() {
  const {data: vendors} = useQuery<Vendor[]>({query: VENDORS_QUERY})
  const {stamp, error} = useStamp()
  return (
    <Stack gap={2}>
      {error ? <Notice tone="critical">Could not save: {error}</Notice> : null}
      {vendors.map((vendor) => (
        <Card key={vendor._id} padding={3} radius={2} border tone={vendor.arrivedAt ? 'positive' : 'default'}>
          <Flex gap={3} align="center">
            <Stack gap={2} flex={1}>
              <Text size={1} weight="medium">
                {vendor.name}
              </Text>
              <Text size={0} muted>
                {[VENDOR_CATEGORIES.find((c) => c.value === vendor.category)?.title, vendor.contact].filter(Boolean).join(' · ')}
              </Text>
            </Stack>
            <Present documentId={vendor._id} documentType="vendor" />
            {vendor.arrivedAt ? (
              <Flex gap={1} align="center">
                <Text size={1}>{watTime(vendor.arrivedAt)}</Text>
                <Button icon={iconFor(Undo02Icon)} mode="bleed" aria-label={`Undo arrival for ${vendor.name}`} title="Undo arrival" onClick={() => void stamp(vendor._id, 'vendor', 'arrivedAt', false)} />
              </Flex>
            ) : (
              <Button text="Arrived" mode="ghost" onClick={() => void stamp(vendor._id, 'vendor', 'arrivedAt', true)} />
            )}
          </Flex>
        </Card>
      ))}
    </Stack>
  )
}

export function Arrivals() {
  const id = useId()
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q)
  return (
    <Box style={{display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)', gap: 32, alignItems: 'start'}}>
      <Stack gap={3}>
        <Text as="label" htmlFor={id} size={1} weight="semibold">
          Guests
        </Text>
        <TextInput id={id} placeholder="Name or invite code" value={q} onChange={(e) => setQ(e.currentTarget.value)} clearButton={q !== ''} onClear={() => setQ('')} />
        <Suspense fallback={<Loading />}>
          <Counts />
        </Suspense>
        <Suspense fallback={<Loading label="Searching" />}>
          <GuestList q={deferred} />
        </Suspense>
      </Stack>
      <Stack gap={3}>
        <Text size={1} weight="semibold">
          Vendors
        </Text>
        <Box>
          <Suspense fallback={<Loading />}>
            <Vendors />
          </Suspense>
        </Box>
      </Stack>
    </Box>
  )
}
