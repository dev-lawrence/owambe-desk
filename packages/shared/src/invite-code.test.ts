import {describe, expect, it} from 'vitest'

import {generateInviteCode, INVITE_CODE_PATTERN} from './invite-code'

describe('invite codes', () => {
  it('generates URL-safe codes without look-alike characters', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateInviteCode()
      expect(code).toMatch(INVITE_CODE_PATTERN)
      expect(code).not.toMatch(/[01ilo]/)
    }
  })
})
