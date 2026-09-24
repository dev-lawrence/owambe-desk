import type {Metadata} from 'next'
import {Bricolage_Grotesque} from 'next/font/google'
import type {ReactNode} from 'react'

import {SanityLive} from '@/sanity/live'

import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-bricolage',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tolu & Emeka · Owambe Desk',
  description: 'The wedding reception of Tolu Adeyemi and Emeka Okafor, Asaba. Planned and run on Owambe Desk.',
}

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en-NG" className={bricolage.variable}>
      <body className="min-h-dvh">
        {children}
        <SanityLive />
      </body>
    </html>
  )
}
