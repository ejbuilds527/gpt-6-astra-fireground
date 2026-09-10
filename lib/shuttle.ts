import type { Snapshot, Document } from './data';
import { positive, valid } from './water';
export function shuttleFacts(d:Snapshot, selectedNames?:string[], demand?:number){
 const route=d.shuttle, timing=d.settings.shuttle_timing || {};
 const fill=d.sources.hydrants?.find((h:Document)=>(h.id||h.facility_id)===route.fill_hydrant);
 const sourceFlow=fill?.flow_gpm;
 const effectiveFill=positive(sourceFlow)&&positive(timing.fill_rate_gpm)?Math.min(sourceFlow,timing.fill_rate_gpm):null;
 const out=route.outbound?.duration_seconds ?? route.outbound_duration_s;
 const back=route.return?.duration_seconds ?? route.return_duration_s;
 const routed=positive(out)&&positive(back);
 const travel=routed?(out+back)/60:null;
 const names=selectedNames??route.assignment??[];
 const roster=d.settings.mutual_aid?.departments??[];
 const tankers=names.map((name:string)=>{
  const rig=roster.find((r:Document)=>r.department===name && r.state!=='HOME');
  const gallons=rig?.tanker_gallons;
  const fillMin=positive(gallons)&&positive(effectiveFill)?gallons/effectiveFill:null;
  const dumpMin=positive(gallons)&&positive(timing.dump_rate_gpm)?gallons/timing.dump_rate_gpm:null;
  const manoeuvre=valid(timing.manoeuvre_fill_site_s)&&valid(timing.manoeuvre_dump_site_s)?(timing.manoeuvre_fill_site_s+timing.manoeuvre_dump_site_s)/60:null;
  const cycle=[travel,fillMin,dumpMin,manoeuvre].every(v=>v!==null)?travel!+fillMin!+dumpMin!+manoeuvre!:null;
  return {department:name,gallons:gallons??'unknown',capacity_source:rig?.tanker_gallons_source||'SYNTHETIC',travel_out_min:positive(out)?out/60:null,travel_back_min:positive(back)?back/60:null,
    fill_min:fillMin,dump_min:dumpMin,manoeuvre_min:manoeuvre,cycle_min:cycle,delivered_gpm:cycle&&positive(gallons)?gallons/cycle:null};
 });
 const complete=tankers.length>0&&tankers.every((t:Document)=>positive(t.delivered_gpm));
 const raw=complete?tankers.reduce((sum:number,t:Document)=>sum+t.delivered_gpm,0):null;
 const sustained=raw!==null&&positive(effectiveFill)?Math.min(raw,effectiveFill):null;
 let required:number|null=null;let cumulative=0;
 if(complete&&positive(demand)&&positive(effectiveFill)&&effectiveFill>=demand){
  for(let i=0;i<tankers.length;i++){cumulative+=tankers[i].delivered_gpm;if(cumulative>=demand){required=i+1;break;}}
 }
 return {fill_hydrant:route.fill_hydrant,fill_gpm:sourceFlow??'unknown',effective_fill_gpm:effectiveFill,demand_gpm:demand??'unknown',
  tankers,tanker_count:tankers.length,tankers_required:required??'unknown',sustained_gpm:sustained??'unknown',
  margin_gpm:sustained!==null&&positive(demand)?sustained-demand:'unknown',
  verdict:sustained===null?'ungraded':positive(demand)&&sustained<demand?'insufficient':'conditional',
  route_status:routed?'outbound and return routed separately':'Separate outbound and return timings NOT SET',
  outbound:route.outbound??null,return:route.return??null,
  side:d.sideOfRoad?.hydrants?.find((h:Document)=>h.id===route.fill_hydrant)??null,
  side_direction:d.sideOfRoad?.direction_of_travel??'unknown',side_finding:d.sideOfRoad?.the_finding,
  nurse:(d.settings.apparatus?.units??[]).filter((u:Document)=>/nurse/i.test(u.role)).map((u:Document)=>u.label),
  queue:timing.queue_time_NOT_MODELLED||'Queue time is not modelled',
 };
}
