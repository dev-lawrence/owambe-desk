'use client'

import {INVITE_LANGUAGES} from '@owambe/shared'
import {useState} from 'react'

type Translation = {language: string | null; text: string | null}

export function InviteMessage({english, translations}: {english: string; translations: Translation[]}) {
  const options = [{value: 'en', title: 'English', text: english}].concat(
    INVITE_LANGUAGES.flatMap((lang) => {
      const text = translations.find((t) => t.language === lang.value)?.text
      return text ? [{value: lang.value, title: lang.title, text}] : []
    }),
  )
  const [language, setLanguage] = useState('en')
  const current = options.find((o) => o.value === language) ?? options[0]!

  return (
    <div>
      {options.length > 1 ? (
        <div role="group" aria-label="Language" className="mb-6 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === language}
              onClick={() => setLanguage(option.value)}
              className="rounded-md border border-line px-3 py-1.5 text-sm aria-pressed:border-accent aria-pressed:text-accent"
            >
              {option.title}
            </button>
          ))}
        </div>
      ) : null}
      <p lang={current.value} className="max-w-2xl text-xl leading-relaxed sm:text-2xl">
        {current.text}
      </p>
    </div>
  )
}
