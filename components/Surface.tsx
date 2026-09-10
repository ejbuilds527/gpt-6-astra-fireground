'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Role, SurfaceIdentity } from '@/lib/role';
// Firestore's role projection is the same contract used by the live endpoint.
type Data = Record<string, any>;
export const number = (v: unknown, digits = 1): string => typeof v === 'number' && Number.isFinite(v)
  ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : typeof v === 'string' && v ? v : 'UNKNOWN';
const value = (call?: Data): Data => call?.output?.value && typeof call.output.value === 'object' ? call.output.value : {};
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

export function Surface({ role, identity, initial }: { role: Role; identity: SurfaceIdentity; initial: Data | null }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(false);
  const [trace, setTrace] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Data | null>(null);
  const [asking, setAsking] = useState(false);
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
  useEffect(() => {
    if (role !== 'command' || !data?.tone_at) return;
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [role, data?.tone_at]);
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
  async function ask(e: React.FormEvent) {
    e.preventDefault(); if (asking) return;
    setAsking(true); setAnswer(null); setError('');
    try {
      const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ question, scenario_id: data?.scenario.id, selected_option: data?.selected_option }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Astra unavailable'); setAnswer(result);
    } catch { setError('Astra answer unavailable. Imagery and lay interpretation remain ungraded; measured supply information is still shown.'); }
    finally { setAsking(false); }
  }
  const elapsed = data?.tone_at && now ? Math.max(0, Math.floor((now - data.tone_at) / 1000)) : null;
  const demand = value(data?.demand), relay = value(data?.relay);
  return <main className="wrap">
    <h1>Fireground · {identity.display}</h1>
    <div className="sub">{identity.station} · {identity.bearing} approach · {identity.distance} mi straight line</div>
    <nav className="nav" aria-label="Account"><span className="status">{role}</span>{role === 'command' && <a href="/settings">Settings</a>}<a href="/signin">Sign in another role</a><span role="status">{live ? 'LIVE' : 'CONNECTING · VALUES MAY BE STALE'}</span></nav>
    {error && <div className="hold" role="alert">{error}</div>}
    {!data ? <div className="view on"><Card title="Incident inputs unavailable"><p>The live connection is retrying. No values have been assumed.</p></Card></div> : <div className="view on">
      <div className="sub">{data.scenario?.dispatch} · {data.scenario?.confidence}</div>
      {role === 'command' && <>
        <div className="addrbar"><button className="go" disabled={pending} onClick={() => command({ action: 'tone' })}>TONE / RESET</button><button className="go" disabled={pending || data.scenario?.id === 'lodge-confirmed'} onClick={() => command({ action: 'confirm' })}>CONFIRM THE LODGE, MICHAEL’S HOUSE</button><button ref={traceButton} className="drawerbtn" aria-expanded={trace} aria-controls="surface-trace" onClick={() => setTrace(!trace)}>{number(data.window_seconds)} s TRACE ›</button></div>
        <div className="clock"><div className={elapsed !== null && elapsed > data.window_seconds ? 'warn' : ''}><div className="dim">TURNOUT</div><div className="big">{elapsed ?? '—'}<span className="unit">s of {number(data.window_seconds)}</span></div></div><div style={{ flex: 1 }}><Stages stages={data.stages}/></div></div>
        <div className="stack">
          <Card title="Supply mode"><div className="modes">{['SHUTTLE', 'RELAY', 'BOTH'].map(option => <button key={option} className={'md ' + (data.selected_option === option ? 'on' : '')} aria-pressed={data.selected_option === option} disabled={pending} onClick={() => command({ action: 'select', option })}>{option}<b>{option === 'SHUTTLE' ? number(value(data.shuttle).sustained_gpm) + ' gpm' : option === 'RELAY' ? data.inventory?.first_alarm?.verdict : 'combined supply'}</b></button>)}</div><p className="hint">Command’s selection: {data.selected_option || 'NOT SELECTED'}. Hydraulic feasibility remains {relay.hydraulic_verdict || 'ungraded'}.</p></Card>
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
  return <Card title="The shuttle"><div className="two"><Stat label="TANKERS REQUIRED" amount={v.tankers_required}/><Stat label="DELIVERED" amount={v.sustained_gpm} unit="gpm"/></div><p className="tsub">{number(v.demand_gpm)} gpm needed · margin {number(v.margin_gpm)} gpm</p><p className="warn">{v.verdict || call?.output?.why || 'UNGRADED'}</p><p className="hint">{v.route_status} · tanker capacities: {(v.tankers || []).map((t: Data) => t.capacity_source).filter((s: string, i: number, all: string[]) => all.indexOf(s) === i).join(', ') || 'UNKNOWN'}</p></Card>;
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
