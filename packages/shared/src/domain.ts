// Single source of truth for the fixed vocabularies in Owambe Desk.
// The Studio schema, the seed script, the web app and the console all import
// these, so a value can't drift between the content model and the code reading it.

type Option<V extends string> = {readonly title: string; readonly value: V}

const values = <V extends string>(options: readonly Option<V>[]) => options.map((o) => o.value)

export const FAMILY_SIDES = [
  {title: "Bride's family", value: 'bride'},
  {title: "Groom's family", value: 'groom'},
] as const satisfies readonly Option<string>[]
export type FamilySide = (typeof FAMILY_SIDES)[number]['value']

export const PERSON_SIDES = [
  ...FAMILY_SIDES,
  {title: 'The couple', value: 'couple'},
  {title: 'Neutral (coordinators, vendors)', value: 'neutral'},
] as const satisfies readonly Option<string>[]
export type PersonSide = (typeof PERSON_SIDES)[number]['value']

export const SIDES_OF_INTEREST = [
  ...FAMILY_SIDES,
  {title: 'Both families', value: 'both'},
] as const satisfies readonly Option<string>[]
export type SideOfInterest = (typeof SIDES_OF_INTEREST)[number]['value']

export const PERSON_ROLES = [
  {title: 'Celebrant (bride or groom)', value: 'celebrant'},
  {title: 'Parent', value: 'parent'},
  {title: 'Elder', value: 'elder'},
  {title: 'Coordinator', value: 'coordinator'},
  {title: 'MC', value: 'mc'},
  {title: 'Vendor contact', value: 'vendorContact'},
  {title: 'Guest', value: 'guest'},
] as const satisfies readonly Option<string>[]
export type PersonRole = (typeof PERSON_ROLES)[number]['value']

export const EVENT_STATUSES = [
  {title: 'Planning', value: 'planning'},
  {title: 'Final week', value: 'finalWeek'},
  {title: 'Live (the day itself)', value: 'live'},
  {title: 'Concluded', value: 'concluded'},
] as const satisfies readonly Option<string>[]
export type EventStatus = (typeof EVENT_STATUSES)[number]['value']

export const RSVP_STATUSES = [
  {title: 'Pending', value: 'pending'},
  {title: 'Attending', value: 'attending'},
  {title: 'Declined', value: 'declined'},
] as const satisfies readonly Option<string>[]
export type RsvpStatus = (typeof RSVP_STATUSES)[number]['value']

export const VENDOR_CATEGORIES = [
  {title: 'Caterer', value: 'caterer'},
  {title: 'DJ', value: 'dj'},
  {title: 'Live band', value: 'band'},
  {title: 'MC', value: 'mc'},
  {title: 'Tailor', value: 'tailor'},
  {title: 'Photographer', value: 'photographer'},
  {title: 'Decor', value: 'decor'},
] as const satisfies readonly Option<string>[]
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]['value']

export const FABRIC_TYPES = [
  {title: 'Aso-oke', value: 'asoOke'},
  {title: 'Lace', value: 'lace'},
  {title: 'George', value: 'george'},
  {title: 'Ankara', value: 'ankara'},
  {title: 'Gele (head tie)', value: 'gele'},
] as const satisfies readonly Option<string>[]
export type FabricType = (typeof FABRIC_TYPES)[number]['value']

export const INVITE_LANGUAGES = [
  {title: 'Yoruba', value: 'yo'},
  {title: 'Igbo', value: 'ig'},
  {title: 'Nigerian Pidgin', value: 'pcm'},
] as const satisfies readonly Option<string>[]
export type InviteLanguage = (typeof INVITE_LANGUAGES)[number]['value']

export const CURRENCIES = [{title: 'Nigerian Naira (NGN)', value: 'NGN'}] as const satisfies readonly Option<string>[]
export type Currency = (typeof CURRENCIES)[number]['value']

export const valuesOf = values
