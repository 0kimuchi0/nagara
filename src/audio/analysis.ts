export interface Levels {
  low: number
  high: number
  volume: number
}

function bandAverage(freq: Uint8Array, binHz: number, lo: number, hi: number): number {
  let sum = 0
  let n = 0
  for (let i = 0; i < freq.length; i++) {
    const hz = i * binHz
    if (hz >= lo && hz <= hi) {
      sum += freq[i]
      n++
    }
  }
  return n === 0 ? 0 : sum / n / 255
}

export function bandLevels(freq: Uint8Array, sampleRate: number, fftSize: number): Levels {
  const binHz = sampleRate / fftSize
  let total = 0
  for (let i = 0; i < freq.length; i++) total += freq[i]
  return {
    low: bandAverage(freq, binHz, 20, 150),
    high: bandAverage(freq, binHz, 2000, 8000),
    volume: freq.length === 0 ? 0 : total / freq.length / 255,
  }
}

export function smooth(prev: number, target: number, dt: number, attack: number, release: number): number {
  const tau = target > prev ? attack : release
  if (tau <= 0) return target
  return prev + (target - prev) * (1 - Math.exp(-dt / tau))
}

const AVG_TAU = 1
const BEAT_RATIO = 1.4
const BEAT_MIN_LEVEL = 0.3
const BEAT_MIN_INTERVAL = 0.25

export class BeatDetector {
  private avg = 0
  private lastTime: number | null = null
  private lastBeat = -Infinity

  update(low: number, timeSec: number): boolean {
    const dt = this.lastTime === null ? 0 : Math.max(0, timeSec - this.lastTime)
    const avgBefore = this.lastTime === null ? low : this.avg
    const beat =
      low > avgBefore * BEAT_RATIO &&
      low > BEAT_MIN_LEVEL &&
      timeSec - this.lastBeat >= BEAT_MIN_INTERVAL
    if (beat) this.lastBeat = timeSec
    // fold current sample in afterwards
    this.avg = avgBefore + (low - avgBefore) * (1 - Math.exp(-dt / AVG_TAU))
    this.lastTime = timeSec
    return beat
  }
}
