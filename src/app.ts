import { BeatDetector, bandLevels, smooth } from './audio/analysis'
import type { MicSource } from './audio/microphone'
import { currentHour, lightingAt, parseHourOverride } from './palette'
import { mulberry32 } from './random'
import { Bubbles } from './scene/bubbles'
import { Floor } from './scene/floor'
import { Jellyfish } from './scene/jellyfish'
import { LightRays } from './scene/lightRays'
import { Particles } from './scene/particles'
import { Plants } from './scene/plants'
import type { Bounds, SceneElement, Stimulus } from './scene/types'
import { setupUI } from './ui'

const MAX_DT = 0.1
const ATTACK = 0.08
const RELEASE = 0.4

export function clampDt(dt: number): number {
  if (!(dt > 0)) return 0
  return Math.min(dt, MAX_DT)
}

export function startApp(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const override = parseHourOverride(window.location.search)
  const rng = mulberry32(Date.now())

  let bounds: Bounds = { width: window.innerWidth, height: window.innerHeight }
  let dpr = 1
  const applySize = () => {
    dpr = window.devicePixelRatio || 1
    bounds = { width: window.innerWidth, height: window.innerHeight }
    canvas.width = Math.max(1, Math.round(bounds.width * dpr))
    canvas.height = Math.max(1, Math.round(bounds.height * dpr))
  }
  applySize()

  // 描画順：光の筋 → 浮遊物 → 海月 → 底 → 水草 → 泡
  const elements: SceneElement[] = [
    new LightRays(bounds, rng),
    new Particles(bounds, rng),
    new Jellyfish(bounds, rng),
    new Floor(bounds, rng),
    new Plants(bounds, rng),
    new Bubbles(bounds, rng),
  ]
  window.addEventListener('resize', () => {
    applySize()
    for (const e of elements) e.resize(bounds)
  })

  let mic: MicSource | null = null
  const beats = new BeatDetector()
  const smoothed = { low: 0, high: 0, volume: 0 }
  setupUI({
    onMic: (m) => {
      mic = m
      beats.reset()
      if (!m) {
        smoothed.low = 0
        smoothed.high = 0
        smoothed.volume = 0
      }
    },
  })

  let last = performance.now()
  const frame = (nowMs: number) => {
    requestAnimationFrame(frame)
    const dt = clampDt((nowMs - last) / 1000)
    last = nowMs
    const lighting = lightingAt(currentHour(new Date(), override))

    let rawLow = 0
    let rawHigh = 0
    let rawVolume = 0
    let beat = false
    if (mic) {
      const lv = bandLevels(mic.read(), mic.sampleRate, mic.fftSize)
      rawLow = lv.low
      rawHigh = lv.high
      rawVolume = lv.volume
      beat = beats.update(lv.low, nowMs / 1000)
    }
    smoothed.low = smooth(smoothed.low, rawLow, dt, ATTACK, RELEASE)
    smoothed.high = smooth(smoothed.high, rawHigh, dt, ATTACK, RELEASE)
    smoothed.volume = smooth(smoothed.volume, rawVolume, dt, ATTACK, RELEASE)
    const stimulus: Stimulus = { ...smoothed, beat, speed: lighting.speed }

    for (const e of elements) e.update(dt, stimulus)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const [tr, tg, tb] = lighting.waterTop
    const [br, bg, bb] = lighting.waterBottom
    const grad = ctx.createLinearGradient(0, 0, 0, bounds.height)
    grad.addColorStop(0, `rgb(${tr | 0},${tg | 0},${tb | 0})`)
    grad.addColorStop(1, `rgb(${br | 0},${bg | 0},${bb | 0})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, bounds.width, bounds.height)
    for (const e of elements) e.draw(ctx, lighting)
  }
  requestAnimationFrame(frame)
}
