'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Role } from '@/lib/roles';
type RecordData=Record<string,any>;
const display=(v:any,places=0):string=>typeof v==='number'?v.toLocaleString(undefined,{maximumFractionDigits:places}):typeof v==='string'?v:'UNKNOWN';
function Facts({call}:{call:RecordData}){
 const v=call?.output?.value;
 if(!v||v==='unknown')return <p className="fg-caution">UNKNOWN — {call?.output?.why || 'Stored inputs missing'}</p>;
 return <pre className="fg-facts">{JSON.stringify(v,null,2)}</pre>;
}
export function Incident({role,identity,initial}:{role:Role;identity:RecordData;initial:RecordData|null}){
 const [data,setData]=useState(initial);
 const [error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [question,setQuestion]=useState('');
 const [answer,setAnswer]=useState<RecordData|null>(null);
 useEffect(()=>{
  let events:EventSource|null=null;
  const connect=()=>{
   events?.close();events=null;
   if(document.hidden)return;
   events=new EventSource('/api/roles/'+role+'/events');
   events.addEventListener('incident',e=>{setData(JSON.parse(e.data));setError('');});
   events.addEventListener('failure',e=>setError(JSON.parse(e.data).error));
   events.onerror=()=>setError('Live connection interrupted. Displayed values may be stale; reconnecting…');
  };
  connect();document.addEventListener('visibilitychange',connect);
  return()=>{events?.close();document.removeEventListener('visibilitychange',connect);};
 },[role]);
 // The clock counts the window down from the tone, shows the overrun, then holds at four windows.
 const windowSeconds=Number(data?.window_seconds)>0?Number(data?.window_seconds):80;
 const holdMs=windowSeconds*4000;
 useEffect(()=>{if(!data?.tone_at)return;const tone=data.tone_at as number;
  const tick=setInterval(()=>{const reading=Date.now();setNow(reading);if(reading-tone>=holdMs)clearInterval(tick);},1000);
  return()=>clearInterval(tick);},[data?.tone_at,holdMs]);
 const [astra,setAstra]=useState<RecordData[]>([]);
 const [astraRunning,setAstraRunning]=useState(false);
 async function runDecide(){
  setAstra([]);setAstraRunning(true);
  try{
   const r=await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   if(!r.ok||!r.body){setError('Astra unavailable ('+r.status+')');setAstraRunning(false);return;}
   const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
   for(;;){
    const {done,value}=await reader.read(); if(done)break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split('\n'); buf=lines.pop()||'';
    for(const ln of lines){ if(!ln.trim())continue;
      try{ const o=JSON.parse(ln); setAstra(a=>[...a,o]); }catch{}
    }
   }
  }catch(e){setError(e instanceof Error?e.message:'Astra unavailable');}
  finally{setAstraRunning(false);}
 }
 async function command(payload:RecordData){
  setPending(true);setError('');
  try{const r=await fetch('/api/roles/command/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const out=await r.json();if(!r.ok)throw new Error(out.error);}
  catch(e){setError(e instanceof Error?e.message:'Command failed');}finally{setPending(false);}
 }
 async function ask(e:React.FormEvent){
  e.preventDefault();setPending(true);setAnswer(null);
  try{const r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,scenario_id:data?.scenario.id,selected_option:data?.selected_option})});const out=await r.json();if(!r.ok)throw new Error(out.error||'Astra unavailable');setAnswer(out);}
  catch(e){setError(e instanceof Error?e.message:'Astra unavailable');}finally{setPending(false);}
 }
 const sinceTone=data?.tone_at?Math.max(0,now-data.tone_at):null;
 const held=sinceTone!==null&&sinceTone>=holdMs;
 const elapsed=sinceTone===null?null:Math.floor(Math.min(sinceTone,holdMs)/1000);
 const remaining=elapsed===null?null:windowSeconds-elapsed;
 const over=remaining!==null&&remaining<0;
 return <main className="fg-console">
  <header className="fg-header"><div><p className="fg-eyebrow">FIREGROUND / {role.toUpperCase()} / TRAINING</p><h1>{identity.display}</h1><p>{identity.station} · Arrival {identity.bearing} · {identity.distance} mi straight line</p></div><div className="fg-nav">{role==='command'&&<Link href="/settings">Settings</Link>}<a href="/signin">Sign in another role</a></div></header>
  {error&&<p role="alert" className="fg-error">{error}</p>}
  {!data?<section><h2>Incident inputs unavailable</h2><p>Live connection is retrying. No supply values have been assumed.</p></section>:<>
   <div className="fg-dispatch"><span>{data.scenario.dispatch}</span><strong>{data.scenario.confidence}</strong></div>
   {role==='command'&&<>
    <section className="fg-toolbar"><div><p className="fg-eyebrow">TURNOUT WINDOW{held?' · HELD':''}</p><strong className={'fg-number '+(over?'fg-caution':'')}>{elapsed===null?'—':over?'+'+(-remaining):remaining} <small>{elapsed===null?`s · ${windowSeconds} s on the tone`:over?`s over ${windowSeconds}`:`s left of ${windowSeconds}`}</small></strong></div><div className="fg-actions"><button disabled={pending} onClick={async()=>{await command({action:'tone'});runDecide();}}>Tone / reset incident</button><button disabled={pending||data.scenario.id==='lodge-confirmed'} onClick={()=>command({action:'confirm'})}>Confirm the Lodge, Michael’s House</button></div></section>
    <section><h2>Attack lines · tap to change</h2><div className="fg-lines">{data.attack_lines.map((line:RecordData)=><button key={line.id} className={data.line_ids.includes(line.id)?'selected':''} aria-pressed={data.line_ids.includes(line.id)} disabled={pending} onClick={()=>command({action:'lines',ids:data.line_ids.includes(line.id)?data.line_ids.filter((id:string)=>id!==line.id):[...data.line_ids,line.id]})}>{line.label}<strong>{line.gpm} gpm</strong><small>{line.detail}</small></button>)}</div></section>
    <div className="fg-grid"><section><p className="fg-eyebrow">ATTACK DEMAND</p><h2 className="fg-number">{display(data.demand.output.value?.gpm)} <small>gpm</small></h2><p>Tank-only duration <b>{display(data.demand.output.value?.tank_seconds)} s</b></p></section><section><p className="fg-eyebrow">FIRST-ALARM RELAY HOSE</p><h2 className="fg-caution">{data.inventory.first_alarm.verdict}</h2><p>{display(data.inventory.first_alarm.known_ft)} ft {data.inventory.first_alarm.is_floor?'known floor':'recorded'} / {display(data.inventory.first_alarm.needed_ft)} ft required</p><p>{data.inventory.first_alarm.staffing_unknown?'First-alarm staffing NOT SET':data.inventory.first_alarm.short_by_ft?display(data.inventory.first_alarm.short_by_ft)+' ft short':'Known hose covers the route'}</p><p>{data.inventory.all.missing.join(', ')}{data.inventory.all.missing.length?' hose NOT SET':''}</p></section></div>
    <section><h2>Hydrants · ranked for {data.scenario.confidence}</h2><div className="fg-table-wrap"><table><thead><tr><th>Source</th><th>Distance*</th><th>Tested flow</th><th>Margin</th><th>Status</th><th>Flow test</th></tr></thead><tbody>{data.hydrants.map((h:RecordData)=>{const v=h.source.output.value;return <tr key={h.id}><th>{h.id}<small>{v.ownership}</small></th><td>{display(h.distance_ft)} ft</td><td>{display(v.gpm,2)} gpm</td><td>{display(v.margin_gpm,2)} gpm</td><td className="fg-caution">{v.verdict}{v.simulated&&<small>SIMULATED RED TAG</small>}</td><td>{v.last_flow_test}<small>{display(v.flow_test_age_days)} days old{v.stale===true?' · STALE':''}</small></td></tr>;})}</tbody></table></div><p className="fg-note">*Precomputed point-to-point distances. These are not surveyed hose lays. Untested capacities remain unknown.</p></section>
    <div className="fg-grid"><section><h2>Relay</h2><p>{display(data.relay.output.value?.segments)} segments · {display(data.relay.output.value?.intermediate_relays)} intermediate relay pumpers</p><p className="fg-caution">Pressure feasibility: {data.relay.output.value?.hydraulic_verdict || 'ungraded'}</p><details><summary>Calculations and assumptions</summary><Facts call={data.relay}/></details></section><Shuttle call={data.shuttle}/></div>
    <section><h2>Command’s supply choice</h2><p>Selected: {data.selected_option || 'NOT SELECTED'}</p><div className="fg-actions">{['SHUTTLE','RELAY','BOTH'].map(option=><button key={option} disabled={pending} onClick={()=>command({action:'select',option})}>{option}</button>)}</div></section>
    <section><h2>Mutual aid · hold the approach open</h2><p>{data.staging.principle}</p><p className="fg-caution">Staging coordinates NOT SET. Bearing groups are guidance, not a dispatch location.</p><div className="fg-actions"><button disabled={pending} onClick={()=>command({action:'hold',held:!data.hold_south})}>{data.hold_south?'Release south hold':'Hold southern approach'}</button><button disabled={pending} onClick={()=>command({action:'assign_shuttle',assigned:!data.shuttle_assigned})}>{data.shuttle_assigned?'Withdraw shuttle assignment':'Assign shuttle'}</button></div><table><thead><tr><th>Department</th><th>Arrival</th><th>State</th></tr></thead><tbody>{data.staging.departments.map((d:RecordData)=><tr key={d.code}><th>{d.department}</th><td>{d.bearing} · {d.distance} mi</td><td><select aria-label={d.department+' state'} disabled={pending} value={data.states[d.code]||'responding'} onChange={e=>command({action:'state',code:d.code,state:e.target.value})}>{data.staging.states.map((s:string)=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></section>
    <section className="fg-astra"><h2>Astra · the decision run{astraRunning&&<small> RUNNING…</small>}</h2>
     {astra.length===0?<p className="fg-caution">Not run. Press Tone to start the five stage loop: code assembles the fact pack, gpt-6-astra proposes, code checks, gpt-5.6-sol challenges from a clean context.</p>:
      <table><thead><tr><th>Stage</th><th>By</th><th>Elapsed</th></tr></thead><tbody>
       {astra.map((st:RecordData,i:number)=><tr key={i}><th>{String(st.stage)} · {String(st.name)}</th><td>{String(st.by)}</td><td>{display(Number(st.elapsedMs),0)} ms</td></tr>)}
      </tbody></table>}
     {astra.length>0&&(()=>{const last=astra[astra.length-1] as RecordData;const pl=last?.payload as RecordData|undefined;
       return pl?<pre className="fg-json">{JSON.stringify(pl,null,1).slice(0,1400)}</pre>:null;})()}
    </section>
    <section><h2>Measured stages</h2><table><thead><tr><th>Stage</th><th>Elapsed</th><th>Budget</th></tr></thead><tbody>{data.stages.map((s:RecordData)=><tr key={s.n}><th>{s.name}{s.precomputed&&<small>Precomputed inputs · live read / calculation</small>}</th><td className={s.measured_ms>s.target_s*1000?'fg-caution':''}>{s.measured_ms===null?'NOT RUN':display(s.measured_ms,2)+' ms'}</td><td>{s.target_s} s</td></tr>)}</tbody></table><p className="fg-caution">{data.model_status}</p></section>
    <section><h2>Ask Astra</h2><form onSubmit={ask} className="fg-actions"><input aria-label="Question for Astra" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Why not the hydrant in front of the building?" maxLength={1000} required/><button disabled={pending}>{pending?'Working…':'Ask'}</button></form>{answer&&<><p className="fg-answer">{answer.answer}</p><p className="fg-note">{answer.model} · {answer.elapsed_ms} ms</p>{answer.tool_calls?.map((c:RecordData,i:number)=><details key={i}><summary>{c.name} · {c.ms} ms</summary><Facts call={c}/></details>)}</>}</section>
   </>}
   {role==='staging'&&<><section><p className="fg-eyebrow">WHERE TO STAGE</p><h2>POINT NOT SET</h2><p>{data.staging.point_reason}</p><h2 className="fg-caution">{data.hold_south?'HOLD — DO NOT ENTER THE FIRE ROAD UNTIL COMMAND CALLS YOU IN':'Hold released by command — confirm your assignment'}</h2><p>My state: <b>{data.states[identity.station]||'responding'}</b></p></section><section><h2>Who shares the southern approach</h2><ul>{(data.staging.split.south||[]).map((name:string)=><li key={name}>{name}</li>)}</ul><p>{data.staging.principle}</p></section></>}
   {role==='tanker'&&<section><p className="fg-eyebrow">MY NEXT MOVE / POSITION {identity.shuttlePosition}</p><h2 className="fg-direction">{data.tanker.side?.side?'FILL '+data.tanker.side.side:'FILL SIDE UNKNOWN'}</h2><p>Hydrant {data.tanker.fill_hydrant} · {data.tanker.direction}</p><p className="fg-caution">{data.tanker.side?.consequence}</p><div className="fg-say"><span>SAY THIS · CONFIRM WITH COMMAND</span>Approaching fill site, hydrant {data.tanker.fill_hydrant}. {data.tanker.side?.side==='LEFT'?'Hydrant is on the far side. Request road closure before connecting.':'Confirm the connection side and traffic control before connecting.'}</div><p>{data.shuttle_assigned?'Shuttle assigned by command':'Awaiting command’s shuttle assignment'}</p><p>{data.tanker.next_move}</p><p>Capacity provenance: {identity.capacitySource}</p></section>}
   {role==='relay'&&<section><p className="fg-eyebrow">MY RELAY SEGMENT / POSITION {identity.relayPosition}</p><h2>{data.relay.position?.role||'Assignment NOT SET'}</h2><p>{data.relay.position?.unit}</p><p>Upstream: {data.relay.upstream?.unit||'NOT SET'} · Downstream: {data.relay.downstream?.unit||'NOT SET'}</p><h2 className="fg-number">{display(data.relay.intake_psi)} <small>psi intake target</small></h2><p className="fg-caution">Discharge: {data.relay.discharge}</p><p>Parking point: NOT SET</p><p>{data.relay.limitation}</p><div className="fg-say"><span>SAY THIS · CONFIRM WITH COMMAND</span>Relay position {identity.relayPosition}, requesting the parking point and verified pressure assignment.</div><details><summary>Segment calculation</summary><Facts call={data.relay.plan}/></details></section>}
   {role==='shuttle'&&<><section><h2>{data.shuttle_assigned?'Assigned to shuttle':'Awaiting command’s shuttle assignment'}</h2><p>My state: {data.states[identity.station]||'responding'}</p><p>Capacity provenance: {identity.capacitySource}</p><p>Position in loop: NOT MODELLED</p></section>{data.shuttle_assigned?<Shuttle call={data.shuttle}/>:<p>Command has not assigned the route.</p>}<section><h2>Planning limitations</h2><p>{data.timing?.queue_time_NOT_MODELLED}</p><p>{data.timing?.nurse_tanker}</p></section></>}
   <footer>{data.mode} · {data.disclaimer}</footer>
  </>}
 </main>;
}
function Shuttle({call}:{call:RecordData}){
 const v=call?.output?.value;
 return <section><p className="fg-eyebrow">SHUTTLE / THE LOOP</p>{v==='unknown'?<p className="fg-caution">UNGRADED — {call.output.why}</p>:<>
  <h2 className="fg-direction">{v?.side?.side?'FILL '+v.side.side:'FILL SIDE UNKNOWN'}</h2>
  <p>Fill site {v?.fill_hydrant} · {display(v?.fill_gpm)} gpm tested</p>
  <p className="fg-caution">{v?.side?.consequence}</p>
  <div className="fg-say"><span>SAY THIS · CONFIRM WITH COMMAND</span>Fill site, hydrant {v?.fill_hydrant}. {v?.side?.side==='LEFT'?'Hydrant is on the far side — request road closure before connecting.':'Confirm traffic control and connection side.'}</div>
  <img src="/shuttle-map.png" alt="Precomputed roadmap from the scene to the fill site, with street names and the route marked" className="fg-roadmap"/>
  <p className="fg-note">Precomputed routed roadmap · scene to fill. {v?.route_status}</p>
  <p className="fg-number">{display(v?.sustained_gpm,1)} <small>gpm sustained</small></p><p>{display(v?.tankers_required)} tankers required · {v?.verdict}</p>
  <div className="fg-table-wrap"><table><thead><tr><th>Tanker</th><th>Out</th><th>Fill</th><th>Back</th><th>Dump</th><th>Positioning</th><th>Cycle · min</th></tr></thead><tbody>{v?.tankers?.map((t:RecordData)=><tr key={t.department}><th>{t.department}<small>{t.capacity_source} · {display(t.gallons)} gal</small></th>{['travel_out_min','fill_min','travel_back_min','dump_min','manoeuvre_min','cycle_min'].map(k=><td key={k}>{display(t[k],1)}</td>)}</tr>)}</tbody></table></div>
  <p>Nurse at dump: {v?.nurse?.join(', ')||'NOT SET'} · excluded from shuttle count</p><p className="fg-caution">{v?.queue}</p>
 </>}<details><summary>Cycle, route and assumptions</summary><Facts call={call}/>{call?.output?.assumptions?.map((a:string)=><p key={a}>{a}</p>)}</details></section>;
}
