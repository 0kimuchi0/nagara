import { describe, expect, it } from 'vitest'
import { BeatDetector, bandLevels, smooth } from './analysis'

const SR = 48000
const FFT = 2048
const binHz = SR / FFT

describe('bandLevels', () => {
  it('returns zeros for silence', () => {
    expect(bandLevels(new Uint8Array(FFT / 2), SR, FFT)).toEqual({ low: 0, high: 0, volume: 0 })
  })

  it('detects low-band only energy', () => {
    const f = new Uint8Array(FFT / 2)
    for (let i = 0; i < f.length; i++) {
      const hz = i * binHz
      if (hz >= 20 && hz <= 150) f[i] = 255
    }
    const r = bandLevels(f, SR, FFT)
    expect(r.low).toBe(1)
    expect(r.high).toBe(0)
    expect(r.volume).toBeGreaterThan(0)
  })

  it('detects high-band only energy', () => {
    const f = new Uint8Array(FFT / 2)
    for (let i = 0; i < f.length; i++) {
      const hz = i * binHz
      if (hz >= 2000 && hz <= 8000) f[i] = 255
    }
    const r = bandLevels(f, SR, FFT)
    expect(r.high).toBe(1)
    expect(r.low).toBe(0)
  })
})

describe('smooth', () => {
  it('does not jump in one frame', () => {
    const up = smooth(0, 1, 1 / 60, 0.1, 0.5)
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(0.25)
  })

  it('falls slower than it rises', () => {
    const rise = smooth(0, 1, 1 / 60, 0.1, 0.5) - 0
    const fall = 1 - smooth(1, 0, 1 / 60, 0.1, 0.5)
    expect(fall).toBeLessThan(rise)
  })
})

describe('BeatDetector', () => {
  function warm(d: BeatDetector) {
    let t = 0
    for (; t < 2; t += 1 / 60) expect(d.update(0.4, t)).toBe(false)
    return t
  }

  it('fires on a sudden rise, then respects the minimum interval', () => {
    const d = new BeatDetector()
    const t = warm(d)
    expect(d.update(0.9, t)).toBe(true)
    expect(d.update(0.9, t + 0.1)).toBe(false)
  })

  it('ignores spikes below the 0.3 threshold', () => {
    const d = new BeatDetector()
    let t = 0
    for (; t < 2; t += 1 / 60) d.update(0.02, t)
    expect(d.update(0.2, t)).toBe(false)
  })
})

describe('smooth guard', () => {
  it('returns the target when tau is zero or negative (no NaN)', () => {
    expect(smooth(0, 1, 0.016, 0, 0.4)).toBe(1)
    expect(smooth(1, 0, 0.016, 0.08, 0)).toBe(0)
    expect(smooth(0.5, 0.5, 0, 0, 0)).toBe(0.5)
  })
})
