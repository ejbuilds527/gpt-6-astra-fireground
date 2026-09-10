/**
 * The dispatch tone and the dispatch voice. Both are generated in the browser:
 * no audio file, no asset. Every function fails silently when the API is absent,
 * so a browser without Web Audio or Web Speech still runs the demo in full.
 */

export type TonePlan = { tone_a_hz: number; tone_a_ms: number; gap_ms: number; tone_b_hz: number; tone_b_ms: number };
export type VoicePlan = { rate: number; pitch: number };

/** settings/dispatch, as Firestore holds it. Read it with readSettings() from lib/data.ts. */
export type DispatchSpec = {
  tone?: Partial<TonePlan>;
  voice?: Partial<VoicePlan>;
  countdown_seconds?: number;
  countdown_rule?: string;
  alarm_1_general?: string;
  alarm_2_confirmed?: string;
  sequence?: string[];
};

export type DemoStep = { t?: string; what?: string; by?: string };

/** settings/demo_sequence, as Firestore holds it. */
export type DemoSequenceSpec = {
  steps?: DemoStep[];
  THE_SELF_CORRECTION?: string;
  second_correction?: string;
  rule?: string;
  live_draw?: string;
  address_preloaded?: string;
};

/** The fallbacks match settings/dispatch. A loaded document always wins. */
export const TONE: TonePlan = { tone_a_hz: 947, tone_a_ms: 1000, gap_ms: 120, tone_b_hz: 1383, tone_b_ms: 3000 };
export const VOICE: VoicePlan = { rate: 0.86, pitch: 0.7 };

const RAMP_S = 0.02; // gain in and out over 20 ms, so the tone starts and stops without a click
const PEAK = 0.28;
const WORDS_PER_SECOND = 2.7; // measured against speechSynthesis at rate 1

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function beep(context: AudioContext, hz: number, at: number, ms: number) {
  const start = context.currentTime + at, end = start + ms / 1000;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = hz;
  oscillator.connect(gain);
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(PEAK, start + RAMP_S);
  gain.gain.setValueAtTime(PEAK, Math.max(start + RAMP_S, end - RAMP_S));
  gain.gain.linearRampToValueAtTime(0, end);
  oscillator.start(start);
  oscillator.stop(end + RAMP_S);
}

/**
 * The two-tone page: 947 Hz for 1.0 s, a 120 ms gap, then 1383 Hz for 3.0 s.
 * Returns the total duration in seconds, which is returned even when no audio plays,
 * so the clock and the voice keep the same schedule on a silent machine.
 */
export function twoTone(plan: Partial<TonePlan> = {}): number {
  const p: TonePlan = { ...TONE, ...plan };
  const total = (p.tone_a_ms + p.gap_ms + p.tone_b_ms) / 1000;
  try {
    const Constructor = audioContextConstructor();
    if (!Constructor) return total;
    const context = new Constructor();
    void context.resume().catch(() => {});
    beep(context, p.tone_a_hz, 0, p.tone_a_ms);
    beep(context, p.tone_b_hz, (p.tone_a_ms + p.gap_ms) / 1000, p.tone_b_ms);
    window.setTimeout(() => { void context.close().catch(() => {}); }, (total + 0.5) * 1000);
  } catch {
    // Web Audio refused. The page keeps running.
  }
  return total;
}

/** True when this browser can read a script aloud. */
export function canSpeak(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined';
  } catch { return false; }
}

/** How long the voice takes to read `text`, in seconds. */
export function estimateSeconds(text: string, rate: number = VOICE.rate): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words || rate <= 0) return 0;
  return words / (WORDS_PER_SECOND * rate);
}

export type SpeakOptions = Partial<VoicePlan> & {
  /** Fires as each word starts, carrying the character offset the engine reports. */
  onBoundary?: (charIndex: number) => void;
  onEnd?: () => void;
};

/**
 * Reads `text` in the dispatch voice: flat, slow, slightly low. Cancels any queued
 * utterance first. Returns the estimated seconds, which is returned even when no
 * voice is available, so a caller can pace a transcript against it either way.
 */
export function speak(text: string, options: SpeakOptions = {}): number {
  const rate = options.rate ?? VOICE.rate, pitch = options.pitch ?? VOICE.pitch;
  const seconds = estimateSeconds(text, rate);
  try {
    if (!text || !canSpeak()) return seconds;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    if (options.onBoundary) utterance.onboundary = event => { try { options.onBoundary?.(event.charIndex); } catch {} };
    if (options.onEnd) {
      utterance.onend = () => { try { options.onEnd?.(); } catch {} };
      utterance.onerror = () => { try { options.onEnd?.(); } catch {} };
    }
    synthesis.speak(utterance);
  } catch {
    // Web Speech refused. The transcript still reveals on the estimate.
  }
  return seconds;
}

/** Cancels anything queued or speaking. */
export function stopSpeaking(): void {
  try { if (canSpeak()) window.speechSynthesis.cancel(); } catch {}
}
