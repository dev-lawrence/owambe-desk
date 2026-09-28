import {randomUUID} from 'node:crypto'

import {INVITE_LANGUAGES, type InviteLanguage} from '@owambe/shared'

import {agentActionsClient, contentClient, SCHEMA_ID} from './clients'
import {TRANSLATE_STYLE_GUIDE} from './prompts'

type EventInvite = {
  _id: string
  inviteMessage: string | null
  inviteTranslations: {_key: string; language: InviteLanguage; text: string; reviewed?: boolean}[] | null
}

/**
 * Translate the invite into Yoruba, Igbo and Nigerian Pidgin with Agent Actions Translate.
 * Each translation is stored unchecked: guests only see it after a fluent person reviews it.
 * A translation a person already checked is left alone unless `force` is set.
 */
export async function translateInvite({force = false, log = console.log}: {force?: boolean; log?: (line: string) => void} = {}) {
  const event = await contentClient.fetch<EventInvite | null>(
    '*[_type == "event" && !(_id in path("drafts.**"))] | order(date asc)[0]{_id, inviteMessage, inviteTranslations}',
  )
  if (!event?.inviteMessage) throw new Error('The event has no English invite message to translate.')

  const translations = [...(event.inviteTranslations ?? [])]
  for (const {value: language, title} of INVITE_LANGUAGES) {
    const existing = translations.find((t) => t.language === language)
    if (existing?.reviewed && !force) {
      log(`${title}: already checked by a person; leaving it. Use --force to redo it.`)
      continue
    }
    // noWrite: Translate returns the translated document without touching the event.
    // We only take the translated invite message out of it.
    const translated = await agentActionsClient.agent.action.translate({
      schemaId: SCHEMA_ID,
      documentId: event._id,
      noWrite: true,
      fromLanguage: {id: 'en', title: 'English'},
      toLanguage: {id: language, title},
      target: {path: ['inviteMessage']},
      styleGuide: TRANSLATE_STYLE_GUIDE,
      styleGuideParams: {language: title},
    })
    const text = (translated as {inviteMessage?: string}).inviteMessage?.trim()
    if (!text || text === event.inviteMessage.trim()) {
      log(`${title}: Translate returned no new text; skipped.`)
      continue
    }
    const entry = {_key: existing?._key ?? randomUUID().slice(0, 12), _type: 'inviteTranslation', language, text, reviewed: false}
    const index = translations.findIndex((t) => t.language === language)
    if (index >= 0) translations[index] = entry
    else translations.push(entry)
    log(`${title}: translated (${text.length} characters), waiting for a person to check it.`)
  }

  await contentClient.patch(event._id).set({inviteTranslations: translations}).commit()
  return translations
}
