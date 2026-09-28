import {asoEbiLot} from './documents/aso-ebi-lot'
import {asoEbiOrder} from './documents/aso-ebi-order'
import {event} from './documents/event'
import {familySide} from './documents/family-side'
import {guest} from './documents/guest'
import {person} from './documents/person'
import {programAdjustment} from './documents/program-adjustment'
import {programItem} from './documents/program-item'
import {programOfEvents} from './documents/program-of-events'
import {vendor} from './documents/vendor'
import {asoEbiColour} from './objects/aso-ebi-colour'
import {inviteTranslation} from './objects/invite-translation'
import {measurements} from './objects/measurements'
import {money} from './objects/money'
import {nonNegotiable} from './objects/non-negotiable'
import {segmentChange} from './objects/segment-change'

export const schemaTypes = [
  event,
  person,
  familySide,
  programOfEvents,
  programItem,
  programAdjustment,
  asoEbiLot,
  asoEbiOrder,
  guest,
  vendor,
  money,
  asoEbiColour,
  nonNegotiable,
  segmentChange,
  inviteTranslation,
  measurements,
]
