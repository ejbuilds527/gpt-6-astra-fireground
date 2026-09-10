import type { Snapshot, Document } from './data';
import { positive, valid } from './water';
/** A leg is stored in minutes. Older records stored seconds; both are read, neither is invented. */
const legMinutes = (min: unknown, seconds: unknown): number | null =>
 positive(min) ? min : positive(seconds) ? seconds / 60 : null;
export function shuttleFacts(d:Snapshot, selectedNames?:string[], demand?:number){
 const route=d.shuttle, timing=d.settings.shuttle_timing || {};
 const fill=d.sources.hydrants?.find((h:Document)=>(h.id||h.facility_id)===route.fill_hydrant);
 const sourceFlow=positive(fill?.flow_gpm)?fill.flow_gpm:positive(route.fill_gpm)?route.fill_gpm:null;
 const effectiveFill=positive(sourceFlow)&&positive(timing.fill_rate_gpm)?Math.min(sourceFlow,timing.fill_rate_gpm):null;
 const out=legMinutes(route.out_minutes,route.outbound?.duration_seconds??route.outbound_duration_s);
 const back=legMinutes(route.back_minutes,route.return?.duration_seconds??route.return_duration_s);
 const routed=out!==null&&back!==null;
 const travel=routed?out+back:null;
 const demandGpm=positive(demand)?demand:positive(route.demand_gpm)?route.demand_gpm:null;
 const names=selectedNames??route.assignment??[];
 const roster=d.settings.mutual_aid?.departments??[];
 // The route document states ONE uniform capacity for every mutual-aid tanker and says why.
 // It is an assumption, not a record, so it stays labelled SYNTHETIC through every number below.
 const uniform=route.tanker_gallons_uniform;
 const tankers=names.map((name:string)=>{
  const rig=roster.find((r:Document)=>r.department===name && r.state!=='HOME');
  const gallons=positive(uniform)?uniform:rig?.tanker_gallons;
  const fillMin=positive(gallons)&&positive(effectiveFill)?gallons/effectiveFill:null;
  const dumpMin=positive(gallons)&&positive(timing.dump_rate_gpm)?gallons/timing.dump_rate_gpm:null;
  const manoeuvre=valid(timing.manoeuvre_fill_site_s)&&valid(timing.manoeuvre_dump_site_s)?(timing.manoeuvre_fill_site_s+timing.manoeuvre_dump_site_s)/60:null;
  const cycle=[travel,fillMin,dumpMin,manoeuvre].every(v=>v!==null)?travel!+fillMin!+dumpMin!+manoeuvre!:null;
  return {department:name,gallons:gallons??'unknown',capacity_source:positive(uniform)?'SYNTHETIC':rig?.tanker_gallons_source||'SYNTHETIC',
    travel_out_min:out,travel_back_min:back,
    fill_min:fillMin,dump_min:dumpMin,manoeuvre_min:manoeuvre,cycle_min:cycle,
    delivered_gpm:cycle&&positive(gallons)?gallons/cycle:null,
    fill_site_share:cycle&&fillMin!==null?fillMin/cycle:null};
 });
 const complete=tankers.length>0&&tankers.every((t:Document)=>positive(t.delivered_gpm));
 const raw=complete?tankers.reduce((sum:number,t:Document)=>sum+t.delivered_gpm,0):null;
 // THE CEILING. One fill point. Delivered flow can never exceed the hydrant's own tested flow,
 // however many tankers run, so the fleet total is capped rather than reported as achieved.
 const sustained=raw!==null&&positive(effectiveFill)?Math.min(raw,effectiveFill):null;
 const fillCapped=raw!==null&&positive(effectiveFill)&&raw>effectiveFill;
 let required:number|null=null;let requiredWhy:string|null=null;let cumulative=0;
 if(complete&&positive(demandGpm)&&positive(effectiveFill)){
  if(effectiveFill<demandGpm){
   requiredWhy=`The fill hydrant tests ${sourceFlow} gpm and the demand is ${demandGpm} gpm. No tanker count raises delivered flow above the hydrant, so a count is not returned.`;
  } else {
   for(let i=0;i<tankers.length;i++){cumulative+=tankers[i].delivered_gpm;if(Math.min(cumulative,effectiveFill)>=demandGpm){required=i+1;break;}}
   if(required===null) requiredWhy=`${tankers.length} assigned tankers deliver ${Math.round(Math.min(cumulative,effectiveFill))} gpm against a demand of ${demandGpm} gpm. More tankers are needed than are assigned.`;
  }
 }
 // Each tanker occupies the single fill point for fill_min of every cycle_min. Over 100% they queue,
 // and queue time is not modelled, so the cycle above understates the real one.
 const utilisation=required!==null?tankers.slice(0,required).reduce((sum:number,t:Document)=>sum+(t.fill_site_share??0),0):null;
 const oversubscribed=utilisation!==null&&utilisation>1;
 return {fill_hydrant:route.fill_hydrant,fill_gpm:sourceFlow??'unknown',effective_fill_gpm:effectiveFill,demand_gpm:demandGpm??'unknown',
  tankers,tanker_count:tankers.length,tankers_required:required??'unknown',tankers_required_why:requiredWhy,
  sustained_gpm:sustained??'unknown',fleet_gpm_uncapped:raw??'unknown',
  fill_ceiling_gpm:effectiveFill??'unknown',
  fill_ceiling:fillCapped?`CAPPED BY THE HYDRANT. The assigned tankers cycle ${Math.round(raw!)} gpm between them, and 1-18 tests ${sourceFlow} gpm. Delivered flow is the hydrant, not the fleet.`
   :'Fleet delivery is below the hydrant ceiling.',
  fill_site_utilisation:utilisation,
  fill_site_finding:oversubscribed?`FILL SITE OVERSUBSCRIBED. ${required} tankers want the single fill point ${Math.round(utilisation!*100)}% of the time. They queue, and queue time is NOT MODELLED, so the cycle below is a FLOOR.`
   :utilisation!==null?`The fill point is occupied ${Math.round(utilisation*100)}% of the time at ${required} tankers.`:'Fill-site occupancy is unknown until a cycle is graded.',
  margin_gpm:sustained!==null&&positive(demandGpm)?sustained-demandGpm:'unknown',
  verdict:sustained===null?'ungraded':positive(demandGpm)&&sustained<demandGpm?'insufficient':positive(demandGpm)?'conditional':'ungraded',
  route_status:routed?route.routed||'outbound and return routed separately':'Separate outbound and return timings NOT SET',
  outbound:route.outbound??(out!==null?{minutes:out}:null),return:route.return??(back!==null?{minutes:back}:null),
  capacity_assumption:route.tanker_size_assumption||'Tanker capacities are SYNTHETIC.',
  timing_source:route.timing_source||timing.standard||'Timing provenance unknown',
  side:d.sideOfRoad?.hydrants?.find((h:Document)=>h.id===route.fill_hydrant)??null,
  side_direction:d.sideOfRoad?.direction_of_travel??'unknown',side_finding:d.sideOfRoad?.the_finding,
  nurse:(d.settings.apparatus?.units??[]).filter((u:Document)=>/nurse/i.test(u.role)).map((u:Document)=>u.label),
  queue:timing.queue_time_NOT_MODELLED||'Queue time is not modelled',
 };
}
