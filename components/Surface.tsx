'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Role, SurfaceIdentity } from '@/lib/role';
// Firestore's role projection is the same contract used by the live endpoint.
type Data = Record<string, any>;
export const number = (v: unknown, digits = 1): string => typeof v === 'number' && Number.isFinite(v)
  ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : typeof v === 'string' && v ? v : 'UNKNOWN';
const value = (call?: Data): Data => call?.output?.value && typeof call.output.value === 'object' ? call.output.value : {};
// The five stages /api/decide emits, and who runs each one. Two of them are models, and they differ.
const DECISION_STAGES = [
  { n: 1, name: 'ASSEMBLE', by: 'code', what: 'fact pack from Firestore and the tools' },
  { n: 2, name: 'PROPOSE', by: 'gpt-6-astra', what: 'reads the imagery, proposes the supply plan' },
  { n: 3, name: 'CHECK', by: 'code', what: 'deterministic checks accept or reject' },
  { n: 4, name: 'CHALLENGE', by: 'gpt-5.6-sol', what: 'challenges the proposal from a clean context' },
  { n: 5, name: 'PRESENT', by: 'code', what: 'the answer command reads' },
];
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}
function Stat({ label, amount, unit }: { label: string; amount: unknown; unit?: string }) {
  return <div><div className="dl">{label}</div><div className="big">{number(amount)}<span className="unit">{unit}</span></div></div>;
}
function Rows({ rows }: { rows: [string, unknown][] }) {
  return <table><tbody>{rows.map(([label, content]) => <tr key={label}><td>{label}</td><td className="r">{number(content)}</td></tr>)}</tbody></table>;
}
function Calculation({ call }: { call?: Data }) {
  return <details><summary>Calculation and assumptions</summary><pre>{JSON.stringify(call?.output ?? { why: 'Inputs unavailable' }, null, 2)}</pre></details>;
}

// children carries server-rendered nodes the page passes in — the maps, which read MAPS_API_KEY
// on the server and cannot be imported into a client component.
// The tone is generated, not loaded: a 2.2 s steady tone then three clipped beeps.
// The dispatch is a recorded file so it sounds identical on every machine.
function soundTheTone() {
  try {
    const C = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const beep = (hz: number, at: number, ms: number, gain: number) => {
      const t = C.currentTime + at, o = C.createOscillator(), g = C.createGain();
      o.type = 'sine'; o.frequency.value = hz; o.connect(g); g.connect(C.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.02);
      g.gain.setValueAtTime(gain, t + ms / 1000 - 0.03);
      g.gain.linearRampToValueAtTime(0, t + ms / 1000);
      o.start(t); o.stop(t + ms / 1000 + 0.02);
    };
    beep(1000, 0, 2200, 0.24);
    beep(1300, 2.45, 170, 0.26);
    beep(1300, 2.75, 170, 0.26);
    beep(1300, 3.05, 170, 0.26);
  } catch { /* a browser that blocks audio must not stop the run */ }
  try {
    const a = new Audio('/dispatch.m4a');
    a.volume = 1;
    setTimeout(() => { a.play().catch(() => {}); }, 3900);
  } catch { /* the clock and the run never depend on sound */ }
}

export function Surface({ role, identity, initial, children }: { role: Role; identity: SurfaceIdentity; initial: Data | null; children?: ReactNode }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(false);
  const [trace, setTrace] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Data | null>(null);
  const [asking, setAsking] = useState(false);
  const [astra, setAstra] = useState<Data[]>([]);
  const [astraRunning, setAstraRunning] = useState(false);
  const traceButton = useRef<HTMLButtonElement>(null);
  const traceClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let events: EventSource | null = null;
    const connect = () => {
      events?.close(); events = null; setLive(false);
      if (document.hidden) return;
      events = new EventSource(`/api/roles/${role}/events`);
      events.addEventListener('incident', event => {
        try { setData(JSON.parse(event.data)); setLive(true); setError(''); }
        catch { setLive(false); setError('Live update could not be read. Displayed values may be stale.'); }
      });
      events.addEventListener('failure', event => {
        setLive(false);
        try { setError(JSON.parse(event.data).error); } catch { setError('Live inputs unavailable.'); }
      });
      events.onerror = () => { setLive(false); setError('Connection interrupted. Displayed values may be stale; reconnecting…'); };
    };
    connect(); document.addEventListener('visibilitychange', connect);
    return () => { events?.close(); document.removeEventListener('visibilitychange', connect); };
  }, [role]);
  // A turnout clock counts the window down from the tone, then shows the overrun.
  // It holds at four windows, so a page left open reads as a finished turnout and not as an uptime counter.
  const windowSeconds = Number(data?.window_seconds) > 0 ? Number(data?.window_seconds) : 80;
  const holdMs = windowSeconds * 4000;
  useEffect(() => {
    if (role !== 'command' || !data?.tone_at) return;
    const tone = data.tone_at as number;
    setNow(Date.now());
    const timer = setInterval(() => {
      const reading = Date.now(); setNow(reading);
      if (reading - tone >= holdMs) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [role, data?.tone_at, holdMs]);
  useEffect(() => {
    if (!trace) return;
    traceClose.current?.focus();
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTrace(false); traceButton.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [trace]);
  async function command(payload: Data) {
    if (role !== 'command' || pending) return;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/roles/command/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Command was not saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Command was not saved.'); }
    finally { setPending(false); }
  }
  // /api/decide answers with one JSON object per line, so each stage is drawn the moment it lands.
  async function runDecide() {
    setAstra([]); setAstraRunning(true);
    try {
      const response = await fetch('/api/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok || !response.body) { setError('The decision run did not start (' + response.status + ').'); return; }
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const stage = JSON.parse(line); setAstra(stages => [...stages, stage]); } catch {}
        }
      }
    } catch { setError('The decision run was interrupted before it finished.'); }
    finally { setAstraRunning(false); }
  }
  async function ask(e: React.FormEvent) {
    e.preventDefault(); if (asking) return;
    setAsking(true); setAnswer(null); setError('');
    try {
      const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ question, scenario_id: data?.scenario.id, selected_option: data?.selected_option }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Astra unavailable'); setAnswer(result);
    } catch { setError('Astra answer unavailable. Imagery and lay interpretation remain ungraded; measured supply information is still shown.'); }
    finally { setAsking(false); }
  }
  const sinceTone = data?.tone_at && now ? Math.max(0, now - data.tone_at) : null;
  const held = sinceTone !== null && sinceTone >= holdMs;
  const elapsed = sinceTone === null ? null : Math.floor(Math.min(sinceTone, holdMs) / 1000);
  const remaining = elapsed === null ? null : windowSeconds - elapsed;
  const over = remaining !== null && remaining < 0;
  const demand = value(data?.demand), relay = value(data?.relay);
  return <main className="wrap">
    <h1>Fireground · {identity.display}</h1>
    <div className="sub">{identity.station} · {identity.bearing} approach · {identity.distance} mi straight line</div>
    <nav className="nav" aria-label="Account"><span className="status">{role}</span>{role === 'command' && <a href="/settings">Settings</a>}<a href="/signin">Sign in another role</a><span role="status">{live ? 'LIVE' : 'CONNECTING · VALUES MAY BE STALE'}</span></nav>
    {error && <div className="hold" role="alert">{error}</div>}
    {!data ? <div className="view on"><Card title="Incident inputs unavailable"><p>The live connection is retrying. No values have been assumed.</p></Card></div> : <div className="view on">
      <div className="sub">{data.scenario?.dispatch} · {data.scenario?.confidence}</div>
      {role === 'command' && <>
        <div className="addrbar"><button className="go" disabled={pending || astraRunning} onClick={async () => { await (soundTheTone(), command({ action: 'tone' })); runDecide(); }}>TONE / RESET</button><button className="go" disabled={pending || data.scenario?.id === 'lodge-confirmed'} onClick={() => command({ action: 'confirm' })}>CONFIRM THE LODGE, MICHAEL’S HOUSE</button><button ref={traceButton} className="drawerbtn" aria-expanded={trace} aria-controls="surface-trace" onClick={() => setTrace(!trace)}>{number(data.window_seconds)} s TRACE ›</button></div>
        <div className="clock"><div className={over ? 'warn' : ''}><div className="dim">TURNOUT{held ? ' · HELD' : ''}</div><div className="big">{elapsed === null ? '—' : over ? '+' + number(-remaining, 0) : number(remaining, 0)}<span className="unit">{elapsed === null ? `s · ${windowSeconds} s on the tone` : over ? `s over ${windowSeconds}` : `s left of ${windowSeconds}`}</span></div></div><div style={{ flex: 1 }}><Stages stages={data.stages}/></div></div>
        <section className="card fg-astra">
          <h2>Astra · the decision run<span className={'runflag ' + (astraRunning ? 'on' : '')}>{astraRunning ? 'RUNNING' : astra.length ? 'COMPLETE' : 'NOT RUN'}</span></h2>
          <p className="hint">Two models, and they are not the same model. gpt-6-astra proposes. gpt-5.6-sol challenges the proposal from a clean context. Code assembles, checks and presents.</p>
          <ol className="fg-stages">{DECISION_STAGES.map(plan => {
            const landed = astra.find(stage => stage.name === plan.name);
            const running = astraRunning && !landed && astra.length + 1 >= plan.n;
            const model = plan.by !== 'code';
            return <li key={plan.n} className={landed ? 'done' : running ? 'active' : 'waiting'}>
              <span className="fg-n">{plan.n}</span>
              <span className="fg-name">{plan.name}<span className="fg-what">{plan.what}</span></span>
              <span className={'fg-by ' + (model ? 'model' : '')}>{String(landed?.by || plan.by)}</span>
              <span className="fg-ms">{landed ? number(landed.elapsedMs, 0) + ' ms' : running ? 'RUNNING' : 'WAITING'}</span>
            </li>;
          })}</ol>
          {astra.length > 0 && <pre className="fg-json">{JSON.stringify(astra[astra.length - 1]?.payload ?? {}, null, 1).slice(0, 1600)}</pre>}
        </section>
        <div className="stack">
          <Card title="Supply mode"><div className="modes">{['SHUTTLE', 'RELAY', 'BOTH'].map(option => <button key={option} className={'md ' + (data.selected_option === option ? 'on' : '')} aria-pressed={data.selected_option === option} disabled={pending} onClick={() => command({ action: 'select', option })}>{option}<b>{option === 'SHUTTLE' ? number(value(data.shuttle).sustained_gpm) + ' gpm' : option === 'RELAY' ? data.inventory?.first_alarm?.verdict : 'combined supply'}</b></button>)}</div><p className="hint">Command’s selection: {data.selected_option || 'NOT SELECTED'}. Hydraulic feasibility remains {relay.hydraulic_verdict || 'ungraded'}.</p></Card>
          {children}
          <div className="grid"><div className="stack">
            <Card title="The lay · nozzle to water"><div className="answer"><span className="answer-side">UNGRADED</span><div className="answer-why-2">{data.model_status}</div></div><p>Driveway path and lay side await imagery interpretation. Hydrant ranking and supply calculations are available below.</p><Rows rows={[["Hose available · ft", data.inventory?.first_alarm?.known_ft], ['Route requires · ft', data.inventory?.first_alarm?.needed_ft], ['Hose short · ft', data.inventory?.first_alarm?.short_by_ft], ['Relay segments', relay.segments], ['Intermediate pumpers', relay.intermediate_relays]]}/><p className="warn">{data.inventory?.first_alarm?.verdict}{data.inventory?.first_alarm?.staffing_unknown ? ' · Staffing NOT SET' : ''}</p><Calculation call={data.relay}/></Card>
            <Card title="Hydrants · ranked for the incident"><div className="scroll"><table><thead><tr><th>ID</th><th className="r">ft</th><th className="r">gpm</th><th>Status / flow test</th></tr></thead><tbody>{(data.hydrants || []).map((h: Data) => { const s = value(h.source); return <tr key={h.id}><td>{h.id}</td><td className="r">{number(h.distance_ft)}</td><td className="r">{number(s.gpm)}</td><td><span className={/red|unavailable/i.test(s.verdict || '') ? 'bad' : 'warn'}>{s.verdict || 'UNKNOWN'}</span>{s.simulated && <div className="warn">SIMULATED RED TAG</div>}<div className="hint">{s.last_flow_test || 'Test date unknown'} · {number(s.flow_test_age_days)} days {s.stale ? '· STALE' : ''}</div></td></tr>; })}</tbody></table></div><p className="hint">Precomputed point-to-point distances; not surveyed hose lays. Missing flow tests remain unknown.</p></Card>
          </div><div className="stack">
            <Card title="Lines off the attack engine"><div className="lines">{(data.attack_lines || []).map((line: Data) => <button key={line.id} className={'ln ' + (data.line_ids.includes(line.id) ? 'on' : '')} aria-pressed={data.line_ids.includes(line.id)} disabled={pending} onClick={() => command({ action: 'lines', ids: data.line_ids.includes(line.id) ? data.line_ids.filter((id: string) => id !== line.id) : [...data.line_ids, line.id] })}>{line.label}<b>{number(line.gpm)}</b></button>)}</div><div className="demand"><Stat label="FLOWING" amount={demand.gpm} unit="gpm"/><Stat label="TANK LASTS" amount={demand.tank_seconds} unit="sec"/></div></Card>
            <ShuttleSummary call={data.shuttle}/>
          </div></div>
          <Card title="Mutual aid · staging"><p>{data.staging?.principle}</p><p className="warn">{data.staging?.point?.name ? `${data.staging.point.name} · PROPOSED — blocks lane; parking not surveyed` : 'Staging point NOT SET'}</p><div className="addrbar"><button className="go" disabled={pending} onClick={() => command({ action: 'hold', held: !data.hold_south })}>{data.hold_south ? 'RELEASE SOUTH HOLD' : 'HOLD SOUTH'}</button><button className="drawerbtn" disabled={pending} onClick={() => command({ action: 'assign_shuttle', assigned: !data.shuttle_assigned })}>{data.shuttle_assigned ? 'WITHDRAW SHUTTLE' : 'ASSIGN SHUTTLE'}</button></div><table><thead><tr><th>Company</th><th>Approach</th><th>State</th></tr></thead><tbody>{(data.staging?.departments || []).map((d: Data) => <tr key={d.code}><td>{d.department}</td><td>{d.bearing} · {number(d.distance)} mi</td><td><select aria-label={d.department + ' state'} disabled={pending} value={data.states[d.code] || 'responding'} onChange={e => command({ action: 'state', code: d.code, state: e.target.value })}>{(data.staging.states || []).map((state: string) => <option key={state}>{state}</option>)}</select></td></tr>)}</tbody></table></Card>
          <Card title="Ask Astra"><form className="addrbar" onSubmit={ask}><input style={{ flex: 1 }} aria-label="Question for Astra" required maxLength={1000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Why not the hydrant in front of the building?"/><button className="go" disabled={asking}>{asking ? 'READING…' : 'ASK'}</button></form>{answer && <><p style={{ whiteSpace: 'pre-wrap' }}>{answer.answer}</p><p className="hint">{answer.model} · {number(answer.elapsed_ms)} ms</p>{answer.tool_calls?.map((call: Data, i: number) => <details key={i}><summary>{call.name} · {number(call.ms)} ms</summary><pre>{JSON.stringify(call, null, 2)}</pre></details>)}</>}</Card>
        </div>
        <aside id="surface-trace" className={'drawer ' + (trace ? 'on' : '')} hidden={!trace} aria-label="Measured turnout trace"><div className="dhead"><div className="dtitle">THE FIRST {number(data.window_seconds)} SECONDS</div><button ref={traceClose} className="dclose" aria-label="Close trace" onClick={() => { setTrace(false); traceButton.current?.focus(); }}>×</button></div><Stages stages={data.stages}/><p className="warn">{data.model_status}</p><p className="hint">Not-run stages have no measured time. Precomputed inputs are labelled; target times are not measurements.</p></aside>
      </>}
      {role === 'staging' && <Staging data={data} identity={identity}/>}
      {role === 'shuttle' && <div className="stack"><Card title="Shuttle assignment"><p className="status">{data.shuttle_assigned ? 'Assigned by command' : 'Awaiting command’s shuttle assignment'}</p><Rows rows={[["My state", data.states[identity.station] || 'responding'], ['Position in loop', 'NOT MODELLED'], ['Capacity provenance', identity.capacitySource]]}/></Card>{data.shuttle_assigned && <ShuttleLoop call={data.shuttle}/>}<Card title="Planning limitations"><p>{data.timing?.queue_time_NOT_MODELLED || 'Queue time is not modelled.'}</p><p>{data.timing?.nurse_tanker}</p></Card></div>}
      {role === 'tanker' && <Tanker data={data} identity={identity}/>}
      {role === 'relay' && <Relay data={data} identity={identity}/>}
      <footer>{data.mode || 'TRAINING'} · {data.disclaimer || 'Training scenario. Confirm operational assignments with command.'}</footer>
    </div>}
  </main>;
}
function Stages({ stages = [] }: { stages?: Data[] }) {
  return <>{stages.map(stage => <div className="stage" key={stage.n}><span>{stage.name}{stage.precomputed && <small className="dim"> · precomputed inputs</small>}</span><span className={'num ' + (typeof stage.measured_ms !== 'number' ? 'dim' : stage.measured_ms > stage.target_s * 1000 ? 'warn' : 'ok')}>{typeof stage.measured_ms === 'number' ? number(stage.measured_ms, 2) + ' ms' : 'NOT RUN'} <small className="dim">/ {number(stage.target_s)} s target</small></span></div>)}</>;
}
function Staging({ data, identity }: { data: Data; identity: SurfaceIdentity }) {
  const staging = data.staging || {};
  const group = (bearing: string) => bearing.includes('S') ? 'south' : bearing.includes('N') ? 'north' : 'unknown';
  const approach = group(identity.bearing);
  const peers = (staging.departments || []).filter((d: Data) => group(d.bearing || '') === approach);
  const state = data.states[identity.station] || 'responding';
  return <div className="grid"><Card title={'Where to stage · ' + identity.orgName}><div className="big">{identity.bearing}<span className="unit">your approach · {identity.distance} mi</span></div><Rows rows={[["Staging point", staging.point?.name || 'NOT SET'], ['Your state', state], ['Called in', ['called in', 'assigned'].includes(state) ? 'Command has called you in' : 'not yet']]}/>{staging.point && <p className="warn">PROPOSED · BLOCKS LANE · parking not surveyed</p>}<p>{staging.point_reason}</p>{staging.overlap && <p className="warn">Inbound route overlap {number(staging.overlap.mutual_aid_to_staging_pct)}% · final approach overlap {number(staging.overlap.staging_to_scene_pct)}% · precomputed route measurements</p>}<p className="hint">{staging.principle}</p><div className="hold">{data.hold_south ? 'DO NOT ENTER THE FIRE ROAD UNTIL COMMAND CALLS YOU IN.' : 'South hold released. Enter only when command calls your company in.'}</div></Card><Card title="Who else is on your approach"><table><thead><tr><th>Company</th><th className="r">mi</th><th>From</th></tr></thead><tbody>{peers.map((d: Data) => <tr key={d.code}><td>{d.department}</td><td className="r">{number(d.distance)}</td><td>{d.bearing}</td></tr>)}</tbody></table>{!peers.length && <p className="warn">Approach roster unavailable.</p>}</Card></div>;
}
function ShuttleSummary({ call }: { call?: Data }) {
  const v = value(call);
  return <Card title="The shuttle"><div className="two"><Stat label="TANKERS REQUIRED" amount={v.tankers_required}/><Stat label="DELIVERED" amount={v.sustained_gpm} unit="gpm"/></div><p className="tsub">{number(v.demand_gpm)} gpm needed · margin {number(v.margin_gpm)} gpm</p><p className="warn">{v.verdict || call?.output?.why || 'UNGRADED'}</p><p className="hint">{v.route_status} · tanker capacities: {(v.tankers || []).map((t: Data) => t.capacity_source).filter((s: string, i: number, all: string[]) => all.indexOf(s) === i).join(', ') || 'UNKNOWN'}</p>{v.fill_site_finding ? <p className="warn">{String(v.fill_site_finding)}</p> : null}{v.fill_site_utilisation ? <p className="hint">Fill point occupied {number(v.fill_site_utilisation)}% of the cycle. Queue time is NOT modelled, so the cycle is a floor, not a total.</p> : null}</Card>;
}
function ShuttleLoop({ call }: { call: Data }) {
  const v = value(call);
  return <div className="grid"><Card title="The loop"><div className="maplay"><img src="/shuttle-map.png" alt="Precomputed road map between the scene and fill site"/></div><div className="whyswap">Precomputed route map. {v.route_status}. Live vehicle positions are not modelled.</div><Rows rows={[["Fill site", v.fill_hydrant], ['Tested fill · gpm', v.fill_gpm], ['Effective fill · gpm', v.effective_fill_gpm], ['Dump nurse · does not shuttle', v.nurse?.join(', ') || 'NOT SET']]}/><p className="warn">{v.side?.consequence}</p><p>{v.queue}</p></Card><div className="stack"><ShuttleSummary call={call}/>{(v.tankers || []).map((t: Data) => <Card key={t.department} title={'The cycle · ' + t.department}><p className="hint">{number(t.gallons)} gal · {t.capacity_source}</p><Rows rows={[["Travel out · min", t.travel_out_min], ['Fill · min', t.fill_min], ['Travel back · min', t.travel_back_min], ['Dump · min', t.dump_min], ['Manoeuvre · min', t.manoeuvre_min], ['Total cycle · min', t.cycle_min]]}/></Card>)}<Calculation call={call}/></div></div>;
}
function Tanker({ data, identity }: { data: Data; identity: SurfaceIdentity }) {
  const t = data.tanker || {};
  return <div className="grid"><Card title="My next move"><div className="answer"><span className="answer-side">{t.side?.side || 'UNKNOWN'}</span><div><div className="answer-why-1">Fill side · {t.fill_hydrant || 'NOT SET'}</div><div className="answer-why-2">{t.direction}</div></div></div><p className="warn">{t.side?.consequence}</p><div className="say"><span className="say-k">CONFIRM WITH COMMAND</span>{t.next_move}</div><p>{data.shuttle_assigned ? 'Shuttle assigned by command' : 'Awaiting command’s shuttle assignment'}</p></Card><Card title="My assignment"><Rows rows={[["Assigned position", identity.shuttlePosition], ['Live cycle position', 'NOT MODELLED'], ['My state', data.states[identity.station] || 'responding'], ['Capacity provenance', identity.capacitySource]]}/><p className="hint">{t.finding}</p></Card></div>;
}
function Relay({ data, identity }: { data: Data; identity: SurfaceIdentity }) {
  const r = data.relay || {};
  return <div className="grid"><Card title="My relay segment"><div className="answer"><span className="answer-side">{identity.relayPosition}</span><div><div className="answer-why-1">{r.position?.unit || 'Unit NOT SET'}</div><div className="answer-why-2">{r.position?.role || 'Assignment NOT SET'}</div></div></div><Rows rows={[["Upstream", r.upstream?.unit || 'NOT SET'], ['Downstream', r.downstream?.unit || 'NOT SET'], ['Parking point', 'NOT SET'], ['My state', data.states[identity.station] || 'responding']]}/><div className="say"><span className="say-k">CONFIRM WITH COMMAND</span>Relay position {identity.relayPosition}, requesting the parking point and verified pressure assignment.</div></Card><Card title="Pressure assignment"><Stat label="INTAKE TARGET" amount={r.intake_psi} unit="psi"/><p className="warn">Discharge: {r.discharge || 'UNKNOWN'}</p><p>{r.limitation}</p><Calculation call={r.plan}/></Card></div>;
}
