import { z } from 'zod';
import { requireRole, sameOrigin } from '@/lib/auth';
import { db, readSnapshot } from '@/lib/data';
import { editableSettings, incidentRef } from '@/lib/incident';
const number=z.number().finite().nonnegative().nullable();
const unit=z.object({id:z.string().min(1).max(80),label:z.string().min(1).max(100),
  pump_gpm:number,tank_gal:number,hose_5in_ft:number,role:z.string().min(1).max(100),
  staffed_first_alarm:z.boolean().nullable()});
const schema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('apparatus'),revision:z.number().int().nonnegative(),units:z.array(unit).min(1).max(100)}),
 z.object({kind:z.literal('friction'),revision:z.number().int().nonnegative(),five_inch:z.number().finite().positive().max(10)}),
 z.object({kind:z.literal('timing'),revision:z.number().int().nonnegative(),fill_rate_gpm:z.number().finite().positive(),dump_rate_gpm:z.number().finite().positive(),manoeuvre_fill_site_s:z.number().finite().nonnegative(),manoeuvre_dump_site_s:z.number().finite().nonnegative()}),
]);
export async function GET(){
 try{await requireRole('command');}catch{return Response.json({error:'Forbidden'},{status:403});}
 try{return Response.json(editableSettings(await readSnapshot()),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Settings unavailable'},{status:503});}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Forbidden'},{status:403});
 let who;try{who=await requireRole('command');}catch{return Response.json({error:'Forbidden'},{status:403});}
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Check the settings: use nonnegative numbers, or leave unknown values blank.'},{status:400});
 const a=parsed.data;
 if(a.kind==='apparatus' && new Set(a.units.map(u=>u.id)).size!==a.units.length)return Response.json({error:'Apparatus identifiers must be unique'},{status:400});
 try{
  await db.runTransaction(async tx=>{
   const ref=db.doc('settings/'+({apparatus:'apparatus',friction:'friction_coefficients',timing:'shuttle_timing'}[a.kind]));
   const doc=await tx.get(ref);const old=doc.data()||{};
   if((old.revision||0)!==a.revision)throw new Error('CONFLICT');
   const audit={revision:a.revision+1,edited_by:who.orgName,edited_at:Date.now()};
   if(a.kind==='apparatus'){
    const units=a.units.map(u=>{
     const prior=old.units?.find((v:{id:string})=>v.id===u.id)||{};
     const changed=Object.entries(u).some(([key,value])=>(prior[key]??null)!==value);
     return {...prior,...u,...(changed?{provenance:'EDITED BY '+who.orgName,original_source:prior.original_source||prior.provenance||old.source||'UNKNOWN'}:{})};
    });
    tx.update(ref,{units,...audit});
   }else if(a.kind==='friction'){
    tx.update(ref,{'single_line.5_inch':a.five_inch,...audit});
   }else{
    const {kind,revision,...values}=a;
    tx.update(ref,{...values,...audit,provenance:'EDITED BY '+who.orgName});
   }
   tx.set(incidentRef(),{updated_at:Date.now(),settings_revision:Date.now()},{merge:true});
  });
  return Response.json({ok:true});
 }catch(error){const conflict=error instanceof Error&&error.message==='CONFLICT';return Response.json({error:conflict?'Settings changed in another tab. Refresh before saving.':'Settings were not saved.'},{status:conflict?409:503});}
}
