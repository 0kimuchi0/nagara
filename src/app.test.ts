import { describe, expect, it } from 'vitest'
import { clampDt } from './app'

describe('clampDt', () => {
  it('caps long frames at 0.1s', () => {
    expect(clampDt(3600)).toBe(0.1)
  })
  it('returns 0 for negative values', () => {
    expect(clampDt(-1)).toBe(0)
  })
  it('passes normal frame times through', () => {
    expect(clampDt(0.016)).toBe(0.016)
  })
})
