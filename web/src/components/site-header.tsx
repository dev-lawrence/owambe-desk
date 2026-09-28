import Link from 'next/link'

const links = [
  {href: '/program', label: 'Program'},
  {href: '/aso-ebi', label: 'Aso ebi'},
  {href: '/how-it-works', label: 'How it works'},
]

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-4 sm:px-8">
        <Link href="/" className="font-semibold tracking-tight">
          Tolu <span className="text-accent">&amp;</span> Emeka
        </Link>
        <ul className="flex gap-5 text-ink-soft">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline-offset-4 hover:text-ink hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-ink-soft sm:px-8">
        Planned and run on Owambe Desk, built on Sanity. Every page here reads the same live content the families and
        the coordinator work on.
      </div>
    </footer>
  )
}
