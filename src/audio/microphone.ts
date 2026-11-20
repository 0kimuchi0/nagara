export interface MicSource {
  read(): Uint8Array
  sampleRate: number
  fftSize: number
  stop(): void
}

const FFT_SIZE = 2048

export async function startMicrophone(): Promise<MicSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia is not supported')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop())
  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0.6
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    const audioCtx = ctx
    let stopped = false
    return {
      read() {
        analyser.getByteFrequencyData(buf)
        return buf
      },
      sampleRate: audioCtx.sampleRate,
      fftSize: FFT_SIZE,
      stop() {
        if (stopped) return
        stopped = true
        stopTracks()
        audioCtx.close().catch(() => {})
      },
    }
  } catch (e) {
    stopTracks()
    ctx?.close().catch(() => {})
    throw e
  }
}
