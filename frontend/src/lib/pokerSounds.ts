/**
 * GS Poker Sound Effects — synthesized via Web Audio API.
 * No external files needed. Royalty-free by definition.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

function playNoise(duration: number, volume = 0.08) {
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = volume;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  source.start();
}

/** Tap-tap sound for check */
export function soundCheck() {
  try {
    playTone(800, 0.06, 'square', 0.08);
    setTimeout(() => playTone(900, 0.05, 'square', 0.06), 80);
  } catch {}
}

/** Chip stack clatter for bet/raise */
export function soundBet() {
  try {
    // Multiple short bursts = chip clinking
    playNoise(0.08, 0.12);
    setTimeout(() => playNoise(0.06, 0.10), 50);
    setTimeout(() => playNoise(0.05, 0.08), 110);
    playTone(1200, 0.08, 'sine', 0.06);
    setTimeout(() => playTone(1400, 0.06, 'sine', 0.04), 60);
  } catch {}
}

/** Clean ting for call */
export function soundCall() {
  try {
    playTone(1100, 0.15, 'sine', 0.10);
    setTimeout(() => playTone(1650, 0.10, 'sine', 0.06), 50);
  } catch {}
}

/** Card slide/ruffle for dealing */
export function soundCard() {
  try {
    playNoise(0.12, 0.06);
    playTone(400, 0.05, 'sine', 0.03);
  } catch {}
}

/** Fold — soft thud */
export function soundFold() {
  try {
    playTone(200, 0.12, 'sine', 0.08);
    playNoise(0.06, 0.04);
  } catch {}
}

/** All-in — dramatic rising tone */
export function soundAllIn() {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.25);
    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.35);
    setTimeout(() => playNoise(0.1, 0.1), 200);
  } catch {}
}

/** Winner — triumphant chord */
export function soundWin() {
  try {
    playTone(523, 0.3, 'sine', 0.10);  // C5
    setTimeout(() => playTone(659, 0.3, 'sine', 0.08), 80);  // E5
    setTimeout(() => playTone(784, 0.4, 'sine', 0.10), 160); // G5
  } catch {}
}
