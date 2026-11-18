/**
 * Tiny synthesized ring tones (no audio assets): an incoming ring and an outgoing ring-back.
 * Browsers may block audio until the user has interacted with the page; failures are silent by design.
 */
let ctx: AudioContext | null = null
let timer: ReturnType<typeof setInterval> | null = null

function burst(freqs: number[], seconds: number) {
  if (!ctx) return
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds)
  gain.connect(ctx.destination)
  for (const f of freqs) {
    const osc = ctx.createOscillator()
    osc.frequency.value = f
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + seconds)
  }
}

export function startTone(kind: 'incoming' | 'outgoing') {
  stopTone()
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = ctx ?? new AC()
    const play = () => (kind === 'incoming' ? (burst([660, 880], 0.35), setTimeout(() => burst([660, 880], 0.35), 450)) : burst([440, 480], 1.6))
    play()
    timer = setInterval(play, kind === 'incoming' ? 2400 : 4000)
  } catch { /* audio unavailable */ }
}

export function stopTone() {
  if (timer) clearInterval(timer)
  timer = null
}
