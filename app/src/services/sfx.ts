// Sons de interface 100% sintetizados via WebAudio. Nunca música.
let ctx: AudioContext | null = null
let enabled = true
let volume = 0.2

function ac(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(
  freq: number,
  durMs: number,
  opts: { type?: OscillatorType; gain?: number; delayMs?: number; slideTo?: number } = {},
) {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + (opts.delayMs ?? 0) / 1000
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'square'
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.slideTo) osc.frequency.linearRampToValueAtTime(opts.slideTo, t0 + durMs / 1000)
  const peak = (opts.gain ?? 0.5) * volume
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + durMs / 1000 + 0.02)
}

let chargeNodes: { osc: OscillatorNode; gain: GainNode } | null = null

export const sfx = {
  configure(opts: { enabled?: boolean; volume?: number }) {
    if (opts.enabled !== undefined) enabled = opts.enabled
    if (opts.volume !== undefined) volume = opts.volume
  },
  /** clique mecânico seco (<40ms) */
  click() {
    tone(2400, 18, { type: 'square', gain: 0.25 })
    tone(160, 30, { type: 'triangle', gain: 0.35 })
  },
  /** tick de contador (odômetro) */
  tick() {
    tone(3200, 12, { type: 'square', gain: 0.1 })
  },
  /** hum grave da ignição (200ms) */
  hum() {
    tone(55, 200, { type: 'sine', gain: 0.8 })
    tone(110, 200, { type: 'sine', gain: 0.3 })
  },
  /** dois ticks + acorde seco grave */
  success() {
    tone(2800, 14, { type: 'square', gain: 0.15 })
    tone(2800, 14, { type: 'square', gain: 0.15, delayMs: 90 })
    tone(110, 180, { type: 'triangle', gain: 0.5, delayMs: 180 })
    tone(165, 180, { type: 'triangle', gain: 0.35, delayMs: 180 })
  },
  /** alerta grave, não estridente */
  error() {
    tone(120, 240, { type: 'sawtooth', gain: 0.4 })
    tone(90, 240, { type: 'sawtooth', gain: 0.3, delayMs: 60 })
  },
  /** charge crescente do hold-to-confirm; corta se soltar */
  chargeStart(durMs: number) {
    const c = ac()
    if (!c) return
    this.chargeEnd(false)
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sawtooth'
    const t0 = c.currentTime
    osc.frequency.setValueAtTime(70, t0)
    osc.frequency.linearRampToValueAtTime(280, t0 + durMs / 1000)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(0.25 * volume, t0 + durMs / 1000)
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    chargeNodes = { osc, gain: g }
  },
  chargeEnd(completed: boolean) {
    if (!chargeNodes) return
    const { osc, gain } = chargeNodes
    chargeNodes = null
    const c = ctx
    if (!c) return
    gain.gain.cancelScheduledValues(c.currentTime)
    gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.02)
    osc.stop(c.currentTime + 0.1)
    if (completed) this.success()
  },
}
