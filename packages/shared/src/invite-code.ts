// Invite codes go in URLs (/i/[code]) and get read aloud over the phone,
// so they avoid characters that look alike (0/o, 1/l/i).
export const INVITE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const INVITE_CODE_PATTERN = /^[a-hj-km-np-z2-9]{6}$/

export function generateInviteCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(random() * INVITE_CODE_ALPHABET.length)]
  }
  return code
}
