import 'server-only'

import {defineLive} from 'next-sanity/live'

import {client} from './client'

// The dataset is public, so live published content needs no token.
// The read token (server only) is for later: reading drafts and workflow state.
export const {sanityFetch, SanityLive} = defineLive({
  client,
  serverToken: process.env.SANITY_API_READ_TOKEN ?? false,
  browserToken: false,
})
