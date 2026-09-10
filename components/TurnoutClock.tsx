'use client';
import { useEffect, useState } from 'react';

/**
 * NFPA 1710 turnout. The clock starts on the tone and counts down from 80 s.
 * Passing 80 is never hidden: the face flips to +N in red and keeps counting the
 * real overrun for as long as the clock runs.
 */
export type TurnoutClockProps = {
  running: boolean;
  /** Date.now() at the first tone. */
  startedAt: number | null;
  /** settings/dispatch.countdown_seconds. */
  seconds?: number;
  label?: string;
  /** settings/dispatch.countdown_rule, shown under the face. */
  rule?: string;
  size?: number;
};

const MUTED = '#6e7a85', ORANGE = '#EF8200', RED = '#c8553d', LINE = 'rgba(140,193,210,.14)';
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)';
const TICK_MS = 100;

export function TurnoutClock({ running, startedAt, seconds = 80, label = 'TURNOUT · NFPA 1710', rule, size = 58 }: TurnoutClockProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!running || startedAt === null) { setNow(null); return; }
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, [running, startedAt]);

  const live = now !== null && startedAt !== null;
  const left = live ? seconds - (now - startedAt) / 1000 : seconds;
  const over = live && left <= 0;
  const face = over ? `+${Math.floor(-left)}` : String(Math.ceil(Math.max(left, 0)));
  const colour = over ? RED : live ? ORANGE : MUTED;
  const fraction = over ? 1 : Math.max(0, Math.min(1, 1 - left / seconds));
  const caption = over ? 'OVER TURNOUT' : live ? `TARGET ${seconds} s` : `${seconds} s ON THE TONE`;

  return (
    <div role="timer" aria-label={`Turnout clock, ${over ? `${Math.floor(-left)} seconds over` : `${Math.ceil(Math.max(left, 0))} seconds remaining`}`}
      style={{ minWidth: 168, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: size, lineHeight: 1, letterSpacing: '-.03em', color: colour, transition: 'color 200ms linear' }}>
        {face}<span style={{ fontSize: Math.round(size * 0.26), color: MUTED, marginLeft: 6 }}>s</span>
      </div>
      <div style={{ height: 2, background: LINE, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${fraction * 100}%`, background: colour, transition: 'width 120ms linear' }} />
      </div>
      <div style={{ fontSize: 10, letterSpacing: '.12em', color: over ? RED : MUTED, fontFamily: MONO }}>{caption}</div>
      {rule ? <p style={{ fontSize: 11, color: MUTED, margin: 0, maxWidth: 260, lineHeight: 1.45 }}>{rule}</p> : null}
    </div>
  );
}

export default TurnoutClock;
