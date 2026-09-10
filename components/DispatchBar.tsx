'use client';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { canSpeak, speak, stopSpeaking, twoTone, type DemoSequenceSpec, type DispatchSpec } from '@/lib/audio';
import { TurnoutClock } from './TurnoutClock';

const CANVAS = '#1c1f25', PANEL = '#23272e', LINE = 'rgba(140,193,210,.14)';
const INK = '#e6ebef', MUTED = '#6e7a85', ORANGE = '#EF8200', RED = '#c8553d';
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)';

/** One ranked hydrant. The rows animate to their new order whenever this array changes. */
export type HydrantRow = { id: string; label?: string; feet?: number | null; tag?: string | null; note?: string | null };
/** Astra's lay side. `side` absent with `needs` present is the refusal. */
export type LaySideResult = { side?: string | null; needs?: string | null; reasons?: string[] };

type Trigger = 'clock' | 'live' | 'ic';
type PlannedStep = { index: number; id: string; t: string; what: string; by: string; offset: number | null; trigger: Trigger };
/** What the parent receives. Join on `index`: it is the position in settings/demo_sequence.steps. */
export type DemoStage = PlannedStep & { firedAt: number; sinceTone: number };

export type DispatchBarHandle = {
  /** Call when a live producer returns, e.g. markArrived('gpt-6-astra'). Its step will not fire until you do. */
  markArrived: (by: string) => void;
  confirmLodge: () => void;
};

export type DispatchBarProps = {
  /** settings/dispatch, read on the server with readSettings() from lib/data.ts. */
  dispatch?: DispatchSpec | null;
  /** settings/demo_sequence, read the same way. Its steps are the stage order. */
  sequence?: DemoSequenceSpec | null;
  address?: string;
  hydrants?: HydrantRow[] | null;
  laySide?: LaySideResult | null;
  /** Producers that have returned, as an alternative to the ref handle. */
  arrivals?: string[];
  onStage?: (stage: DemoStage) => void;
  onToneStart?: (startedAt: number) => void;
  onConfirm?: () => void;
  ref?: Ref<DispatchBarHandle>;
};

const slug = (what: string) => what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').split('-').slice(0, 6).join('-');

/** Reads the schedule out of settings/demo_sequence. A `t` with no number waits on the IC; a step by a model waits on its arrival. */
function planSteps(sequence?: DemoSequenceSpec | null): PlannedStep[] {
  return (sequence?.steps ?? []).map((step, index) => {
    const t = (step.t ?? '').trim(), what = (step.what ?? '').trim(), by = (step.by ?? '').trim();
    const parsed = Number.parseFloat(t.replace(/[^0-9.]/g, ''));
    const offset = Number.isFinite(parsed) ? parsed : null;
    const machine = by === 'code' || by === 'browser';
    return { index, id: slug(what) || `step-${index}`, t, what, by, offset, trigger: offset === null ? 'ic' : machine ? 'clock' : 'live' };
  });
}

const snapToWord = (text: string, chars: number) => {
  if (chars >= text.length) return text.length;
  const next = text.indexOf(' ', Math.max(chars, 0));
  return next === -1 ? text.length : next;
};

const eyebrow = { fontSize: 10, letterSpacing: '.14em', color: MUTED } as const;

function Control({ label, live, disabled, onClick }: { label: string; live?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled}
    style={{ font: 'inherit', fontSize: 13, letterSpacing: '.1em', padding: '11px 18px', cursor: disabled ? 'default' : 'pointer',
      background: live ? ORANGE : 'transparent', color: live ? CANVAS : disabled ? MUTED : INK,
      border: `1px solid ${live ? ORANGE : LINE}`, borderRadius: 0, opacity: disabled ? 0.45 : 1 }}>{label}</button>;
}

/** The ranking inversion. Rows are moved with a FLIP transform, never cross-faded. */
function HydrantRanking({ rows }: { rows?: HydrantRow[] | null }) {
  const frame = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const next = new Map<string, number>();
    element.querySelectorAll<HTMLElement>('[data-hydrant]').forEach(node => {
      const id = node.dataset.hydrant ?? '', top = node.offsetTop;
      next.set(id, top);
      const previous = tops.current.get(id);
      if (previous === undefined || previous === top) return;
      node.style.transition = 'none';
      node.style.transform = `translateY(${previous - top}px)`;
      window.requestAnimationFrame(() => {
        node.style.transition = 'transform 720ms cubic-bezier(.2,.7,.2,1)';
        node.style.transform = 'translateY(0)';
      });
    });
    tops.current = next;
  }, [rows]);
  return (
    <div>
      <div style={eyebrow}>HYDRANT RANKING · BY DISTANCE</div>
      {!rows ? <p style={{ color: MUTED, fontSize: 12, margin: '10px 0 0' }}>AWAITING THE RANKED HYDRANTS</p>
        : rows.length === 0 ? <p style={{ color: MUTED, fontSize: 12, margin: '10px 0 0' }}>NO HYDRANTS RETURNED</p>
        : <div ref={frame} style={{ position: 'relative', marginTop: 8 }}>
            {rows.map((row, index) => (
              <div key={row.id} data-hydrant={row.id}
                style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'baseline', padding: '9px 0', borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
                <span style={{ fontSize: 13, color: INK }}>
                  {row.label ?? row.id}
                  {row.tag ? <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', color: RED, border: `1px solid ${RED}`, padding: '1px 5px' }}>{row.tag}</span> : null}
                  {row.note ? <span style={{ display: 'block', fontSize: 11, color: MUTED }}>{row.note}</span> : null}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 14, color: INK, fontVariantNumeric: 'tabular-nums' }}>
                  {typeof row.feet === 'number' ? `${row.feet.toLocaleString()} ft` : 'UNKNOWN'}
                </span>
              </div>
            ))}
          </div>}
    </div>
  );
}

/** The refusal, then the resolution. The refusal stays on screen once seen. */
function LaySidePanel({ result }: { result?: LaySideResult | null }) {
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => { if (result && !result.side) setRefused(result.needs ?? 'NEEDS A MEASUREMENT'); }, [result]);
  const resolved = result?.side ?? null;
  return (
    <div>
      <div style={eyebrow}>LAY SIDE · ASTRA</div>
      {!result ? <p style={{ color: MUTED, fontSize: 12, margin: '10px 0 0' }}>AWAITING ASTRA</p> : null}
      {refused ? (
        <div style={{ marginTop: 8, borderLeft: `2px solid ${resolved ? MUTED : ORANGE}`, padding: '8px 12px' }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.1em', color: resolved ? MUTED : ORANGE, textDecoration: resolved ? 'line-through' : 'none' }}>NEEDS A MEASUREMENT</div>
          <p style={{ fontSize: 12, color: MUTED, margin: '4px 0 0', lineHeight: 1.5 }}>{refused}</p>
        </div>
      ) : null}
      {resolved ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 40, lineHeight: 1, letterSpacing: '-.03em', color: ORANGE }}>{resolved}</div>
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
            {(result?.reasons ?? []).map(reason => (
              <li key={reason} style={{ fontSize: 12, color: INK, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function DispatchBar({ dispatch, sequence, address, hydrants, laySide, arrivals, onStage, onToneStart, onConfirm, ref }: DispatchBarProps) {
  const steps = useMemo(() => planSteps(sequence), [sequence]);
  const alarm1 = dispatch?.alarm_1_general ?? '', alarm2 = dispatch?.alarm_2_confirmed ?? '';
  const preloaded = (address ?? (sequence?.address_preloaded ?? '').split('. ')[0] ?? '').trim() || '208 Valley Rd, New Canaan, CT';

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [toning, setToning] = useState(false);
  const [fired, setFired] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const [transcript, setTranscript] = useState<{ label: string; text: string; shown: number }>({ label: '', text: '', shown: 0 });
  const [voice, setVoice] = useState(true);

  const firedRef = useRef(0), arrivedRef = useRef(arrived), confirmedRef = useRef(false), boundaryRef = useRef(0);
  const revealRef = useRef(0), timersRef = useRef<number[]>([]);
  const stageRef = useRef(onStage), toneRef = useRef(onToneStart), confirmRef = useRef(onConfirm);
  useEffect(() => { stageRef.current = onStage; toneRef.current = onToneStart; confirmRef.current = onConfirm; });
  useEffect(() => { setVoice(canSpeak()); }, []);
  useEffect(() => () => {
    stopSpeaking();
    window.clearInterval(revealRef.current);
    timersRef.current.forEach(id => window.clearTimeout(id));
  }, []);

  const readScript = useCallback((text: string, label: string) => {
    boundaryRef.current = 0;
    window.clearInterval(revealRef.current);
    setTranscript({ label, text, shown: 0 });
    const seconds = speak(text, {
      rate: dispatch?.voice?.rate, pitch: dispatch?.voice?.pitch,
      onBoundary: index => { boundaryRef.current = Math.max(boundaryRef.current, index); },
    });
    const from = Date.now();
    revealRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - from) / 1000;
      const byTime = seconds > 0 ? Math.round(text.length * Math.min(1, elapsed / seconds)) : text.length;
      const shown = snapToWord(text, Math.max(byTime, boundaryRef.current));
      setTranscript(current => (current.text === text ? { ...current, shown } : current));
      if (shown >= text.length) { window.clearInterval(revealRef.current); revealRef.current = 0; }
    }, 60);
  }, [dispatch]);

  const markArrived = useCallback((by: string) => {
    if (!by || arrivedRef.current.has(by)) return;
    const next = new Set(arrivedRef.current).add(by);
    arrivedRef.current = next;
    setArrived(next);
  }, []);
  useEffect(() => { (arrivals ?? []).forEach(markArrived); }, [arrivals, markArrived]);

  const confirmLodge = useCallback(() => {
    if (confirmedRef.current || !alarm2) return;
    confirmedRef.current = true;
    setConfirmed(true);
    readScript(alarm2, 'ALARM 2 · LODGE CONFIRMED');
    confirmRef.current?.();
  }, [alarm2, readScript]);

  useImperativeHandle(ref, () => ({ markArrived, confirmLodge }), [markArrived, confirmLodge]);

  // Steps fire in the document's order. A clock step never outruns a live step in front of it.
  useEffect(() => {
    if (startedAt === null) return;
    const advance = () => {
      let moved = false;
      while (firedRef.current < steps.length) {
        const step = steps[firedRef.current];
        const sinceTone = (Date.now() - startedAt) / 1000;
        const ready = step.trigger === 'clock' ? sinceTone >= (step.offset ?? 0)
          : step.trigger === 'live' ? arrivedRef.current.has(step.by)
          : confirmedRef.current;
        if (!ready) break;
        firedRef.current += 1;
        moved = true;
        stageRef.current?.({ ...step, firedAt: Date.now(), sinceTone });
      }
      if (moved) setFired(firedRef.current);
    };
    advance();
    const tick = window.setInterval(advance, 100);
    return () => window.clearInterval(tick);
  }, [startedAt, steps, arrived, confirmed]);

  const soundTheTone = useCallback(() => {
    if (startedAt !== null || !alarm1) return;
    firedRef.current = 0;
    arrivedRef.current = new Set();
    confirmedRef.current = false;
    setFired(0); setArrived(new Set()); setConfirmed(false);
    setTranscript({ label: 'TWO-TONE PAGE', text: '', shown: 0 });
    const started = Date.now();
    setStartedAt(started);
    setToning(true);
    toneRef.current?.(started);
    const seconds = twoTone(dispatch?.tone);
    timersRef.current.push(window.setTimeout(() => {
      setToning(false);
      readScript(alarm1, 'ALARM 1 · GENERAL');
    }, seconds * 1000));
  }, [alarm1, dispatch, readScript, startedAt]);

  const waiting = startedAt !== null && fired < steps.length ? steps[fired] : null;
  const waitLabel = !waiting ? '' : waiting.trigger === 'live' ? `WAITING ON ${waiting.by.toUpperCase()}`
    : waiting.trigger === 'ic' ? 'WAITING ON THE IC' : `AT ${waiting.t}`;

  return (
    <section style={{ background: PANEL, border: `1px solid ${LINE}`, color: INK, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div style={eyebrow}>DISPATCH · NEW CANAAN</div>
        <div style={{ ...eyebrow, fontFamily: MONO, color: startedAt === null ? MUTED : ORANGE }}>
          {startedAt === null ? 'STANDING BY' : waiting ? waitLabel : 'SEQUENCE COMPLETE'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: CANVAS, border: `1px solid ${LINE}`, padding: '10px 14px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 15 }}>{preloaded}</span>
        <span style={{ ...eyebrow, color: ORANGE }}>PRE-LOADED</span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Control label={toning ? 'TONE OUT' : 'SOUND THE TONE'} live={toning} disabled={startedAt !== null || !alarm1} onClick={soundTheTone} />
        <Control label="CONFIRM THE LODGE" disabled={startedAt === null || confirmed || !alarm2} onClick={confirmLodge} />
      </div>

      {!alarm1 || !alarm2 ? (
        <p style={{ color: RED, fontSize: 12, margin: 0, fontFamily: MONO }}>
          settings/dispatch is not loaded. The tone is held rather than read from a hardcoded script.
        </p>
      ) : null}
      {!voice ? <p style={{ color: MUTED, fontSize: 11, margin: 0 }}>This browser has no speech synthesis. The transcript still reveals at reading pace.</p> : null}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TurnoutClock running={startedAt !== null} startedAt={startedAt} seconds={dispatch?.countdown_seconds ?? 80} rule={dispatch?.countdown_rule} />
        <div style={{ flex: '1 1 320px', minWidth: 260 }}>
          <div style={eyebrow}>{transcript.label || 'CAD TRANSCRIPT'}</div>
          <p style={{ fontFamily: MONO, fontSize: 14, lineHeight: 1.6, color: INK, margin: '8px 0 0', minHeight: 84 }}>
            {transcript.text.slice(0, transcript.shown)}
            {transcript.text && transcript.shown < transcript.text.length ? <span style={{ color: ORANGE }}>▌</span> : null}
            {!transcript.text && toning ? <span style={{ color: ORANGE, letterSpacing: '.3em' }}>• • •</span> : null}
          </p>
        </div>
      </div>

      <div>
        <div style={eyebrow}>SEQUENCE · settings/demo_sequence</div>
        <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {steps.map(step => {
            const done = step.index < fired, now = step.index === fired && startedAt !== null;
            const colour = done ? INK : now ? ORANGE : MUTED;
            return (
              <li key={step.id + step.index} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 10, padding: '6px 0', borderBottom: `1px solid ${LINE}`, color: colour, fontSize: 12 }}>
                <span style={{ fontFamily: MONO, color: MUTED }}>{step.t}</span>
                <span>{step.what}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', color: now ? ORANGE : MUTED }}>{done ? 'DRAWN' : now ? waitLabel : step.by.toUpperCase()}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <HydrantRanking rows={hydrants} />
        <LaySidePanel result={laySide} />
      </div>

      {sequence?.rule ? <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{sequence.rule}</p> : null}
    </section>
  );
}

export default DispatchBar;
