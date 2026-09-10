'use client';
import { useState } from 'react';
import Link from 'next/link';
import { hoseInventory } from '@/lib/apparatus';
type Data=Record<string,any>;
export function Settings({initial}:{initial:Data}){
 const [data,setData]=useState(initial);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 function editUnit(index:number,key:string,value:unknown){setData({...data,apparatus:{...data.apparatus,units:data.apparatus.units.map((u:Data,i:number)=>i===index?{...u,[key]:value}:u)}});}
 async function save(kind:string){
  setBusy(true);setMessage('');
  const payload=kind==='apparatus'?{kind,revision:data.apparatus.revision,units:data.apparatus.units}
   :kind==='attack'?{kind,revision:data.attack.revision,lines:data.attack.lines.map((line:Data)=>({id:line.id,default_on:line.default_on}))}
   :kind==='friction'?{kind,revision:data.friction.revision,five_inch:data.friction.five_inch}
   :{kind,revision:data.timing.revision||0,...Object.fromEntries(['fill_rate_gpm','dump_rate_gpm','manoeuvre_fill_site_s','manoeuvre_dump_site_s'].map(k=>[k,data.timing[k]]))};
  try{
   const response=await fetch('/settings/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const result=await response.json();if(!response.ok)throw new Error(result.error);
   const fresh=await fetch('/settings/data');if(!fresh.ok)throw new Error('Saved, but refresh failed. Reload settings before another edit.');
   const saved=await fresh.json();const section=kind==='friction'?'friction':kind==='timing'?'timing':kind==='attack'?'attack':'apparatus';setData(current=>({...current,[section]:saved[section]}));setMessage('Saved. Connected incident screens recompute automatically.');
  }catch(e){setMessage(e instanceof Error?e.message:'Save failed');}finally{setBusy(false);}
 }
 const hose=hoseInventory({settings:{apparatus:data.apparatus,policy:data.calculation.policy,apparatus_derivation:data.calculation.derivation},relay:data.calculation.relay,site:{},sources:{},shuttle:{},scenario:{},scenarioId:'settings-preview'});
 const numeric=(v:string)=>v===''?null:Number(v);
 return <main className="fg-console fg-settings"><header className="fg-header"><div><p className="fg-eyebrow">FIREGROUND / COMMAND / SETTINGS</p><h1>The inputs decide the answer</h1></div><Link href="/app/command">Back to incident</Link></header>
 {message&&<p role="status">{message}</p>}<fieldset className="settings-fields" disabled={busy} style={{border:0,padding:0,minWidth:0}}>
 <section><h2>Apparatus and hose</h2><p>{data.apparatus.source}</p><p className="fg-note">Blank means NOT SET. Unknown hose makes the sum a floor. Tankers and nurses are excluded from engine supply-line hose.</p>
 <p aria-live="polite">Current inputs · {hose.all.known_ft.toLocaleString()} ft {hose.all.is_floor?'known (FLOOR)':'total'}{hose.all.missing.length?'; '+hose.all.missing.join(', ')+' not recorded':''}. First alarm: <strong>{hose.first_alarm.verdict}{hose.first_alarm.verdict==='SHORT'?' '+hose.first_alarm.short_by_ft?.toLocaleString()+' ft':''}</strong>. Save apparatus to apply these inputs to the incident.</p>
 <p className="fg-note">{data.calculation.derivation.null_rule}</p>{hose.first_alarm.staffing_unknown&&<p role="status">First-alarm staffing is NOT SET. Record Yes or No for each engine before grading the first-alarm relay.</p>}<div className="fg-table-wrap"><table><thead><tr><th>ID<small>NO NFPA SOURCE · Department designator</small></th><th>Label<small>NO NFPA SOURCE</small></th><th>Pump · gpm<small>NFPA 1900 · Rated capacity</small></th><th>Tank · gal<small>NFPA 1900 · Rated capacity</small></th><th>5-inch · ft<small>NO NFPA SOURCE · Department inventory</small></th><th>Role<small>NO NFPA SOURCE</small></th><th>First alarm<small>NO NFPA SOURCE · Department staffing</small></th><th>Provenance</th><th></th></tr></thead><tbody>
 {data.apparatus.units.map((u:Data,i:number)=><tr key={u.id}><th>{u.id}</th><td><input aria-label={u.id+' label'} type="text" value={u.label} onChange={e=>editUnit(i,'label',e.target.value)}/></td>
 {['pump_gpm','tank_gal','hose_5in_ft'].map(k=><td key={k}><input aria-label={u.id+' '+k} type="number" min="0" placeholder="NOT SET" value={u[k]??''} onChange={e=>editUnit(i,k,numeric(e.target.value))}/></td>)}
 <td><select aria-label={u.id+' role'} value={u.role} onChange={e=>editUnit(i,'role',e.target.value)}>{!['attack','supply','engine','tanker','nurse'].includes(u.role)&&<option>{u.role}</option>}{['attack','supply','engine','tanker','nurse'].map(r=><option key={r}>{r}</option>)}</select></td>
 <td><select aria-label={u.id+' first alarm'} value={u.staffed_first_alarm===null?'':String(u.staffed_first_alarm)} onChange={e=>editUnit(i,'staffed_first_alarm',e.target.value===''?null:e.target.value==='true')}><option value="">NOT SET</option><option value="true">Yes</option><option value="false">No</option></select></td>
 <td><small>{u.provenance}</small></td><td><button aria-label={'Remove '+u.id} onClick={()=>setData({...data,apparatus:{...data.apparatus,units:data.apparatus.units.filter((_:Data,n:number)=>n!==i)}})}>Remove</button></td></tr>)}
 </tbody></table></div><div className="fg-actions"><button onClick={()=>setData({...data,apparatus:{...data.apparatus,units:[...data.apparatus.units,{id:'rig-'+crypto.randomUUID().slice(0,8),label:'New apparatus',pump_gpm:null,tank_gal:null,hose_5in_ft:null,role:'engine',staffed_first_alarm:null,provenance:'NOT SET'}]}})}>Add apparatus</button><button disabled={busy} onClick={()=>save('apparatus')}>Save apparatus</button></div></section>
 <section><h2>5-inch friction coefficient</h2><p>{data.friction.source}</p><small>{/NFPA/.test(data.friction.source)?'':'NO NFPA SOURCE · Department coefficient table'}</small><div className="fg-actions"><label>C <input aria-label="5-inch coefficient" type="number" min="0.001" step="0.001" value={data.friction.five_inch??''} onChange={e=>setData({...data,friction:{...data.friction,five_inch:numeric(e.target.value)}})}/></label><button disabled={busy} onClick={()=>save('friction')}>Save coefficient</button></div><p className="fg-note">The relay calculations read this value on every recomputation. Unknown elevation and appliance losses remain ungraded.</p></section>
 <section><h2>Shuttle cycle inputs</h2><p>{data.timing?.standard||'NO NFPA SOURCE'}</p>{data.timing&&[['fill_rate_gpm','Fill rate · gpm','fill_rate_source'],['dump_rate_gpm','Dump rate · gpm','dump_rate_source'],['manoeuvre_fill_site_s','Fill-site manoeuvre · seconds','manoeuvre_source'],['manoeuvre_dump_site_s','Dump-site manoeuvre · seconds','manoeuvre_source']].map(([key,label,source])=><p key={key}><label>{label} <input type="number" min="0" aria-label={label} value={data.timing[key]??''} placeholder="NOT SET" onChange={e=>setData({...data,timing:{...data.timing,[key]:numeric(e.target.value)}})}/></label><small>{data.timing[source]||'NO NFPA SOURCE'}{data.timing[source]&&!/NFPA/.test(data.timing[source])?' · NO NFPA SOURCE':''}</small></p>)}<button disabled={busy||!data.timing} onClick={()=>save('timing')}>Save shuttle timing</button></section>
 <section><h2>Attack lines</h2><p>Default lines for an incident. Active incident selections remain under command control.</p><p>{data.attack?.source || 'NO NFPA SOURCE'}{data.attack?.source&&!/NFPA/.test(data.attack.source)?' · NO NFPA SOURCE':''}</p>
 <div className="fg-actions">{data.attack?.lines.map((line:Data,index:number)=><button key={line.id} type="button" role="switch" aria-checked={line.default_on} aria-label={line.name+' '+(index+1)} style={{minHeight:64,minWidth:160}} onClick={()=>setData({...data,attack:{...data.attack,lines:data.attack.lines.map((item:Data)=>item.id===line.id?{...item,default_on:!item.default_on}:item)}})}>{line.name} · {line.gpm??'UNKNOWN'} gpm · {line.default_on?'ON':'OFF'}</button>)}</div>
 <button disabled={busy||data.attack?.lines.length!==3} onClick={()=>save('attack')}>Save attack lines</button></section>
 </fieldset><style jsx>{`
 .settings-fields small { display: block; font-weight: normal; }
 .settings-fields input, .settings-fields select, .settings-fields button { min-height: 48px; }
 .settings-fields section { margin-bottom: 32px; }
 `}</style></main>;
}
