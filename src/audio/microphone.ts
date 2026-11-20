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
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.smoothingTimeConstant = 0.6
  ctx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Uint8Array(analyser.frequencyBinCount)
  return {
    read() {
      analyser.getByteFrequencyData(buf)
      return buf
    },
    sampleRate: ctx.sampleRate,
    fftSize: FFT_SIZE,
    stop() {
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
  }
}
