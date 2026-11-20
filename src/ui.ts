import { startMicrophone } from './audio/microphone'
import type { MicSource } from './audio/microphone'

const HIDE_MS = 3000
const PROMPT_DIM_MS = 5000

export interface UIHandlers {
  onMic(mic: MicSource | null): void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text) e.textContent = text
  return e
}

export function setupUI(h: UIHandlers): void {
  let mic: MicSource | null = null
  let starting = false

  const prompt = el('button', 'prompt', 'クリックで音に反応させる')
  prompt.type = 'button'
  const gear = el('button', 'gear', '⚙')
  gear.type = 'button'
  gear.setAttribute('aria-label', '設定')
  const menu = el('div', 'menu')
  const fsBtn = el('button', 'menu-btn', '全画面')
  const micBtn = el('button', 'menu-btn', 'マイク オン')
  fsBtn.type = 'button'
  micBtn.type = 'button'
  menu.append(fsBtn, micBtn)
  document.body.append(prompt, gear, menu)

  const setMic = (m: MicSource | null) => {
    mic = m
    micBtn.textContent = m ? 'マイク オフ' : 'マイク オン'
    h.onMic(m)
  }

  const enableMic = async () => {
    if (starting || mic) return
    starting = true
    try {
      setMic(await startMicrophone())
    } catch (e) {
      console.warn('マイクを使えませんでした。時間帯モードで続けます。', e)
      setMic(null)
    } finally {
      starting = false
    }
  }

  prompt.addEventListener('click', () => {
    prompt.classList.add('gone')
    void enableMic()
  })
  setTimeout(() => prompt.classList.add('dim'), PROMPT_DIM_MS)

  micBtn.addEventListener('click', () => {
    if (mic) {
      mic.stop()
      setMic(null)
    } else {
      prompt.classList.add('gone')
      void enableMic()
    }
  })
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  })
  gear.addEventListener('click', () => menu.classList.toggle('open'))

  let timer: number | undefined
  const hideChrome = () => {
    document.body.classList.remove('active')
    menu.classList.remove('open')
  }
  const onMove = () => {
    document.body.classList.add('active')
    window.clearTimeout(timer)
    timer = window.setTimeout(hideChrome, HIDE_MS)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('pointerdown', onMove)
  timer = window.setTimeout(hideChrome, HIDE_MS)
}
