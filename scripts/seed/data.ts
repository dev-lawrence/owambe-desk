// Demo data for the wedding reception of Tolu Adeyemi and Emeka Okafor.
// All people, businesses and the venue are fictional.
import type {FabricType, PersonRole, PersonSide, RsvpStatus, SideOfInterest, VendorCategory} from '@owambe/shared'

export const EVENT_DATE = '2026-12-12' // a Saturday

// No phone numbers: this dataset is public, and invented Nigerian numbers could belong to real people.
export type PersonSeed = {key: string; name: string; side: PersonSide; role: PersonRole}

export const people: PersonSeed[] = [
  // The couple
  {key: 'tolu', name: 'Tolu Adeyemi', side: 'couple', role: 'celebrant'},
  {key: 'emeka', name: 'Emeka Okafor', side: 'couple', role: 'celebrant'},
  // Bride's family (Yoruba, Abeokuta roots, living in Lagos)
  {key: 'adebayo', name: 'Chief Adebayo Adeyemi', side: 'bride', role: 'parent'},
  {key: 'folake', name: 'Mrs Folake Adeyemi', side: 'bride', role: 'parent'},
  {key: 'bisi', name: 'Chief (Mrs) Bisi Ogunleye', side: 'bride', role: 'elder'},
  // Groom's family (Igbo, from Asaba)
  {key: 'nnamdi', name: 'Chief Nnamdi Okafor', side: 'groom', role: 'parent'},
  {key: 'ngozi', name: 'Mrs Ngozi Okafor', side: 'groom', role: 'parent'},
  {key: 'ikechukwu', name: 'Chief Ikechukwu Okafor', side: 'groom', role: 'elder'},
  // Coordinators and MCs
  {key: 'adaeze', name: 'Adaeze Nwosu', side: 'neutral', role: 'coordinator'},
  {key: 'kunle', name: 'Kunle Bakare', side: 'neutral', role: 'coordinator'},
  {key: 'gbenga', name: 'MC Gbenga Adewale', side: 'bride', role: 'mc'},
  {key: 'chinedu', name: 'MC Chinedu Eze', side: 'groom', role: 'mc'},
  // Vendor contacts
  {key: 'efe', name: 'Mrs Efe Oghenekaro', side: 'neutral', role: 'vendorContact'},
  {key: 'obinna', name: 'Obinna Nwachukwu', side: 'neutral', role: 'vendorContact'},
  {key: 'ifeanyi', name: 'Ifeanyi Obi', side: 'neutral', role: 'vendorContact'},
  {key: 'segun', name: 'Segun Ayanlade', side: 'neutral', role: 'vendorContact'},
  {key: 'bimpe', name: 'Bimpe Alade', side: 'neutral', role: 'vendorContact'},
  {key: 'chukwudi', name: 'Chukwudi Anene', side: 'neutral', role: 'vendorContact'},
  {key: 'tobi', name: 'Tobi Salako', side: 'neutral', role: 'vendorContact'},
  {key: 'uche', name: 'Uche Okonkwo', side: 'neutral', role: 'vendorContact'},
  // Guests: bride's side
  {key: 'femi', name: 'Femi Adeyemi', side: 'bride', role: 'guest'},
  {key: 'bukola', name: 'Bukola Adeyemi', side: 'bride', role: 'guest'},
  {key: 'yetunde', name: 'Mrs Yetunde Balogun', side: 'bride', role: 'guest'},
  {key: 'kemi', name: 'Dr Kemi Oladipo', side: 'bride', role: 'guest'},
  {key: 'wale', name: 'Wale Ogunbiyi', side: 'bride', role: 'guest'},
  {key: 'funmilayo', name: 'Mrs Funmilayo Akinola', side: 'bride', role: 'guest'},
  {key: 'tunde', name: 'Tunde Adebisi', side: 'bride', role: 'guest'},
  {key: 'ronke', name: 'Mrs Ronke Oyelaran', side: 'bride', role: 'guest'},
  {key: 'kayode', name: 'Kayode Afolabi', side: 'bride', role: 'guest'},
  {key: 'damilola', name: 'Damilola Ojo', side: 'bride', role: 'guest'},
  {key: 'abimbola', name: 'Mrs Abimbola Coker', side: 'bride', role: 'guest'},
  // Guests: groom's side
  {key: 'chidi', name: 'Chidi Okafor', side: 'groom', role: 'guest'},
  {key: 'amaka', name: 'Amaka Okafor', side: 'groom', role: 'guest'},
  {key: 'obiageli', name: 'Dr Obiageli Nnaji', side: 'groom', role: 'guest'},
  {key: 'kelechi', name: 'Kelechi Nwankwo', side: 'groom', role: 'guest'},
  {key: 'chioma', name: 'Mrs Chioma Eze', side: 'groom', role: 'guest'},
  {key: 'ebuka', name: 'Ebuka Obi', side: 'groom', role: 'guest'},
  {key: 'nneka', name: 'Mrs Nneka Okeke', side: 'groom', role: 'guest'},
  {key: 'tochukwu', name: 'Tochukwu Anyanwu', side: 'groom', role: 'guest'},
  {key: 'ifeoma', name: 'Ifeoma Chukwu', side: 'groom', role: 'guest'},
  {key: 'somto', name: 'Somto Okoli', side: 'groom', role: 'guest'},
  {key: 'uchenna', name: 'Barr. Uchenna Madu', side: 'groom', role: 'guest'},
  // Friends of the couple
  {key: 'zainab', name: 'Zainab Bello', side: 'couple', role: 'guest'},
  {key: 'david', name: 'David Oghenero', side: 'couple', role: 'guest'},
  {key: 'grace', name: 'Mrs Grace Edet', side: 'couple', role: 'guest'},
]

export const event = {
  title: 'Tolu & Emeka: Wedding Reception',
  venue: {name: 'Oshimili Grand Hall', address: 'Nnebisi Road, Asaba'},
  city: 'Asaba, Delta State',
  status: 'planning' as const,
  colours: [
    {name: 'Emerald', hex: '#0F5B46', side: 'bride' as SideOfInterest},
    {name: 'Gold', hex: '#B8923A', side: 'bride' as SideOfInterest},
    {name: 'Wine', hex: '#6B1E2E', side: 'groom' as SideOfInterest},
    {name: 'Champagne', hex: '#D9C3A0', side: 'groom' as SideOfInterest},
  ],
  inviteMessage:
    'Together with their families, Tolu Adeyemi and Emeka Okafor invite you to celebrate their wedding reception on Saturday, 12 December 2026, at Oshimili Grand Hall, Nnebisi Road, Asaba. Guests arrive from 2pm. Please wear the aso ebi of your side and come ready to dance. Kindly reply by 21 November so we can count plates.',
}

export const familySides = [
  {
    side: 'bride' as const,
    approvers: ['adebayo', 'folake'],
    nonNegotiables: [
      {
        requirement: 'The Adeyemi family prayer for the couple, led by Chief (Mrs) Bisi Ogunleye, comes before the cake is cut.',
        reason: 'Among us, the elders bless a new home before anything is shared out. Cutting the cake first would put the celebration before the blessing.',
      },
      {
        requirement: 'Talking drummers lead the couple’s entrance. No DJ track plays over them.',
        reason: 'Tolu’s grandfather’s people are drummers’ people. The drum calls her name and praise (oriki) as she comes in.',
      },
      {
        requirement: 'Elders on both sides are seated and served before the couple’s entrance.',
        reason: 'Elders should not be kept standing or hungry while younger people are celebrated.',
      },
      {
        requirement: 'The formal program, everything before the dance floor opens, ends by 7:30pm.',
        reason: 'Many of our elders will leave early to rest before driving back to Lagos. They must see the whole formal program.',
      },
    ],
    notes:
      'Mrs Folake Adeyemi is the first person to call about anything on this side. Chief Adeyemi would like a short speech, not a long one. The family is happy to share the MC role with the groom’s MC.',
  },
  {
    side: 'groom' as const,
    approvers: ['nnamdi', 'ikechukwu'],
    nonNegotiables: [
      {
        requirement: 'Kola nut is presented and broken by the eldest Okafor man present before any food or drink is served.',
        reason: 'Oji is the first thing offered to guests in Igbo custom. Serving food before kola disrespects the elders and the ancestors.',
      },
      {
        requirement: 'The kola is blessed in Igbo, not English.',
        reason: 'As our people say, oji anaghị anụ bekee: kola does not understand English.',
      },
      {
        requirement: 'The umunna (the Okafor kinsmen) are acknowledged by name during the family introductions.',
        reason: 'The kinsmen stand with the family in marriage. Leaving them out would be noticed and remembered.',
      },
      {
        requirement: 'The highlife band plays live for the parents’ dance.',
        reason: 'Chief Nnamdi Okafor and his wife danced to live highlife at their own wedding in Asaba in 1989.',
      },
    ],
    notes:
      'Chief Ikechukwu Okafor is the eldest of the Okafor umunna and will break the kola. Mrs Ngozi Okafor handles the women’s groups. The family would like palm wine served to the elders after the kola.',
  },
]

export const brief = `We want the reception to feel like both our families, not one family hosting the other.

Guests arrive from 2pm. We would like to make our entrance by 4pm at the latest.

Please keep speeches to three: one from each of our fathers and one from our friend Zainab Bello.

We want a proper cake cutting, our first dance, and time for the aso ebi groups from both sides to dance.

Food should not wait until everyone is tired and hungry.

We want the dance floor open for at least an hour at the end. The hall has to be cleared by 10pm.

Two MCs, Gbenga and Chinedu, sharing the microphone. Adaeze is running the day.`

export type VendorSeed = {key: string; name: string; category: VendorCategory; contact: string}

export const vendors: VendorSeed[] = [
  {key: 'deltaPot', name: 'Delta Pot Catering', category: 'caterer', contact: 'efe'},
  {key: 'obiSounds', name: 'Obi Sounds', category: 'dj', contact: 'obinna'},
  {key: 'highlife', name: 'Oshimili Highlife Band', category: 'band', contact: 'ifeanyi'},
  {key: 'drummers', name: 'Ayan Agalu Drummers', category: 'band', contact: 'segun'},
  {key: 'bimpeCouture', name: 'Bimpe Couture', category: 'tailor', contact: 'bimpe'},
  {key: 'aneneStitches', name: 'Anene Stitches', category: 'tailor', contact: 'chukwudi'},
  {key: 'lensByTobi', name: 'Lens by Tobi', category: 'photographer', contact: 'tobi'},
  {key: 'asabaBlooms', name: 'Asaba Blooms', category: 'decor', contact: 'uche'},
]

export type LotSeed = {colourName: string; fabricType: FabricType; unit: string; amount: string; stock: number; tailor?: string}

export const lots: LotSeed[] = [
  {colourName: 'Emerald', fabricType: 'asoOke', unit: 'Gele and ipele (shoulder sash)', amount: '45000.00', stock: 120, tailor: 'bimpeCouture'},
  {colourName: 'Emerald', fabricType: 'lace', unit: '5 yards of cord lace', amount: '85000.00', stock: 60, tailor: 'bimpeCouture'},
  {colourName: 'Gold', fabricType: 'gele', unit: 'One damask gele', amount: '15000.00', stock: 150},
  {colourName: 'Wine', fabricType: 'george', unit: '6 yards of george wrapper', amount: '65000.00', stock: 80, tailor: 'aneneStitches'},
  {colourName: 'Champagne', fabricType: 'ankara', unit: '6 yards of ankara', amount: '18500.00', stock: 200, tailor: 'aneneStitches'},
]

export type GuestSeed = {person: string; seats: number; table: string; rsvp: RsvpStatus}

export const guests: GuestSeed[] = [
  // High table
  {person: 'adebayo', seats: 1, table: 'High table', rsvp: 'attending'},
  {person: 'folake', seats: 1, table: 'High table', rsvp: 'attending'},
  {person: 'nnamdi', seats: 1, table: 'High table', rsvp: 'attending'},
  {person: 'ngozi', seats: 1, table: 'High table', rsvp: 'attending'},
  {person: 'bisi', seats: 2, table: '1', rsvp: 'attending'},
  {person: 'ikechukwu', seats: 2, table: '2', rsvp: 'attending'},
  // Bride's side
  {person: 'femi', seats: 2, table: '3', rsvp: 'attending'},
  {person: 'bukola', seats: 1, table: '3', rsvp: 'attending'},
  {person: 'yetunde', seats: 2, table: '4', rsvp: 'attending'},
  {person: 'kemi', seats: 2, table: '4', rsvp: 'pending'},
  {person: 'wale', seats: 1, table: '5', rsvp: 'declined'},
  {person: 'funmilayo', seats: 2, table: '5', rsvp: 'attending'},
  {person: 'tunde', seats: 1, table: '6', rsvp: 'pending'},
  {person: 'ronke', seats: 2, table: '6', rsvp: 'attending'},
  {person: 'kayode', seats: 1, table: '7', rsvp: 'pending'},
  {person: 'damilola', seats: 1, table: '7', rsvp: 'attending'},
  {person: 'abimbola', seats: 2, table: '8', rsvp: 'attending'},
  // Groom's side
  {person: 'chidi', seats: 2, table: '9', rsvp: 'attending'},
  {person: 'amaka', seats: 1, table: '9', rsvp: 'attending'},
  {person: 'obiageli', seats: 2, table: '10', rsvp: 'attending'},
  {person: 'kelechi', seats: 1, table: '10', rsvp: 'pending'},
  {person: 'chioma', seats: 2, table: '11', rsvp: 'attending'},
  {person: 'ebuka', seats: 1, table: '11', rsvp: 'declined'},
  {person: 'nneka', seats: 2, table: '12', rsvp: 'attending'},
  {person: 'tochukwu', seats: 1, table: '12', rsvp: 'pending'},
  {person: 'ifeoma', seats: 1, table: '13', rsvp: 'attending'},
  {person: 'somto', seats: 1, table: '13', rsvp: 'attending'},
  {person: 'uchenna', seats: 2, table: '14', rsvp: 'pending'},
  // Friends of the couple
  {person: 'zainab', seats: 1, table: '15', rsvp: 'attending'},
  {person: 'david', seats: 2, table: '15', rsvp: 'attending'},
  {person: 'grace', seats: 2, table: '16', rsvp: 'pending'},
]
