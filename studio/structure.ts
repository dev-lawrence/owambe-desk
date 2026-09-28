import type {StructureResolver} from 'sanity/structure'

// Grouped the way a coordinator thinks about the job, not alphabetically.
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Owambe Desk')
    .items([
      S.documentTypeListItem('event').title('Events'),
      S.documentTypeListItem('familySide').title('Family sides'),
      S.divider(),
      S.documentTypeListItem('programOfEvents').title('Programs of events'),
      S.documentTypeListItem('programItem').title('Program items'),
      S.documentTypeListItem('programAdjustment').title('Live adjustments'),
      S.divider(),
      S.documentTypeListItem('asoEbiLot').title('Aso ebi lots'),
      S.documentTypeListItem('asoEbiOrder').title('Aso ebi orders'),
      S.divider(),
      S.documentTypeListItem('guest').title('Guests'),
      S.documentTypeListItem('vendor').title('Vendors'),
      S.documentTypeListItem('person').title('People'),
    ])
