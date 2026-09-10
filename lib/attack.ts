import type {Document,Snapshot} from './data';
export function attackSnapshot(snapshot:Snapshot, selected?:string[]|null):Snapshot{
 const d=structuredClone(snapshot);
 const lines=d.settings.attack_lines?.lines;
 if(Array.isArray(lines)){
  const chosen=selected??lines.filter((l:Document)=>l.default_on).map((l:Document)=>l.id);
  const attack=(d.settings.apparatus?.units??[]).find((u:Document)=>u.role==='attack');
  d.settings.attack_scenario={...d.settings.attack_scenario,lines:chosen.map(id=>lines.find((l:Document)=>l.id===id)).filter(Boolean),tank_gallons:attack?.tank_gal};
 }
 return d;
}
