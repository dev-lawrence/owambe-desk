import {usePresenceForDocument, useReportPresence} from '@sanity/sdk-react'
import {Avatar, AvatarStack} from '@sanity/ui'

type Handle = {documentId: string; documentType: string}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Who else has this document open, in the console or the Studio (they share one presence room).
 * One avatar per person, even if they have two tabs open.
 */
export function Present(handle: Handle) {
  const {presence} = usePresenceForDocument(handle)
  const people = [...new Map(presence.map((p) => [p.user.sanityUserId || p.sessionId, p.user])).values()]
  if (people.length === 0) return null
  return (
    <AvatarStack maxLength={3} size={0}>
      {people.map((user) => (
        <Avatar
          key={user.sanityUserId}
          size={0}
          src={user.profile.imageUrl}
          initials={initials(user.profile.displayName)}
          title={`${user.profile.displayName} is here`}
        />
      ))}
    </AvatarStack>
  )
}

/** Tell everyone else the signed-in coordinator is on this document. Render only while it is focused. */
export function ReportPresence(handle: Handle) {
  useReportPresence(handle)
  return null
}
