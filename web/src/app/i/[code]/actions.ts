'use server'

import {INVITE_CODE_PATTERN} from '@owambe/shared'
import {createClient} from 'next-sanity'
import {revalidatePath} from 'next/cache'

import {apiVersion, dataset, projectId} from '@/sanity/env'

export type RsvpState = {error?: string; saved?: 'attending' | 'declined'}

/** Records a guest's reply. The invite code is the only credential, as on the printed card. */
export async function reply(_state: RsvpState, formData: FormData): Promise<RsvpState> {
  const code = String(formData.get('code') ?? '')
  const answer = formData.get('rsvp')
  if (!INVITE_CODE_PATTERN.test(code)) return {error: 'This invite link is not valid.'}
  if (answer !== 'attending' && answer !== 'declined') return {error: 'Choose whether you can come.'}

  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!token) return {error: 'Replies are switched off on this copy of the site.'}
  const client = createClient({projectId, dataset, apiVersion, token, useCdn: false})

  const guest = await client.fetch<{_id: string} | null>('*[_type == "guest" && inviteCode == $code][0]{_id}', {code})
  if (!guest) return {error: 'We could not find this invite.'}

  await client.patch(guest._id).set({rsvp: answer}).commit({tag: 'owambe.rsvp'})
  revalidatePath(`/i/${code}`)
  return {saved: answer}
}
