import {describe, expect, it} from 'vitest'

import {formatNaira, multiply, sum, toMinor} from './money'

describe('money', () => {
  it('formats whole Naira without kobo', () => {
    expect(formatNaira('45000.00')).toBe('₦45,000')
    expect(formatNaira('1250000.00')).toBe('₦1,250,000')
  })

  it('keeps kobo when there is some', () => {
    expect(formatNaira('18500.50')).toBe('₦18,500.50')
    expect(formatNaira('0.05')).toBe('₦0.05')
  })

  it('multiplies without floating point error', () => {
    expect(multiply('18500.50', 3)).toBe('55501.50')
    expect(multiply('0.10', 3)).toBe('0.30')
  })

  it('sums decimal strings exactly', () => {
    expect(sum(['0.10', '0.20'])).toBe('0.30')
    expect(sum([])).toBe('0.00')
  })

  it('rejects amounts that are not decimal strings at currency precision', () => {
    for (const bad of ['45000', '45,000.00', '45000.0', '-5.00', '045.00', '1e5']) {
      expect(() => toMinor(bad)).toThrow()
    }
  })

  it('rejects invalid quantities', () => {
    expect(() => multiply('10.00', 0)).toThrow()
    expect(() => multiply('10.00', 1.5)).toThrow()
  })
})
