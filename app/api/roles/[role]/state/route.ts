import { z } from 'zod';
import { requireRole, sameOrigin } from '@/lib/auth';
import { isRole } from '@/lib/roles';
import { db } from '@/lib/data';
import { incidentRef, incidentView, initialIncident } from '@/lib/incident';
export const runtime = 'nodejs';
const action = z.discriminatedUnion('action', [
  z.object({action:z.literal('tone')}),
  z.object({action:z.literal('reset')}),
  z.object({action:z.literal('lines'),ids:z.array(z.string()).max(30)}),
  z.object({action:z.literal('confirm')}),
  z.object({action:z.literal('select'), option:z.enum(['SHUTTLE','RELAY','BOTH'])}),
  z.object({action:z.literal('hold'), held:z.boolean()}),
  z.object({action:z.literal('assign_shuttle'), assigned:z.boolean()}),
  z.object({action:z.literal('state'), code:z.string().min(1).max(80), state:z.enum(['responding','staged','called in','assigned','released'])}),
]);
export async function GET(_request:Request, ctx:{params:Promise<{role:string}>}) {
  const {role}=await ctx.params;
  if(!isRole(role)) return Response.json({error:'Unknown role'},{status:404});
  let identity; try { identity=await requireRole(role); } catch { return Response.json({error:'Forbidden'},{status:403}); }
  try {
    const doc=await incidentRef().get();
    return Response.json(await incidentView(role,{...initialIncident,...doc.data()},identity),{headers:{'Cache-Control':'no-store'}});
  } catch {return Response.json({error:'Incident inputs unavailable; values remain unknown.'},{status:503});}
}
export async function POST(request:Request,ctx:{params:Promise<{role:string}>}) {
  if((await ctx.params).role!=='command' || !sameOrigin(request)) return Response.json({error:'Forbidden'},{status:403});
  let identity;
  try{identity=await requireRole('command');}catch{return Response.json({error:'Forbidden'},{status:403});}
  const parsed=action.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:'Invalid command'},{status:400});
  const a=parsed.data;
  try {
    await db.runTransaction(async tx=>{
      const ref=incidentRef(); const existing=await tx.get(ref);
      const state={...initialIncident,...existing.data()};
      let change:Record<string,unknown>={};
      if(a.action==='lines'){
        const settings=await tx.get(db.doc('settings/attack_lines'));
        const available=settings.data()?.lines||[];
        if(new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!available.some((l:{id:string})=>l.id===id)))throw new Error('Unknown line');
        change={line_ids:a.ids};
      }
      if(a.action==='tone') change={...initialIncident,tone_at:Date.now()};
      // STOP AND RESET ARE ONE ACT. tone_at null is the standing-by state, and the
      // clock is server state, so nothing a browser does can clear it.
      if(a.action==='reset') change={...initialIncident,tone_at:null};
      if(a.action==='confirm') change={scenario_id:'lodge-confirmed'};
      if(a.action==='select') change={selected_option:a.option};
      if(a.action==='hold') change={hold_south:a.held};
      if(a.action==='assign_shuttle') change={shuttle_assigned:a.assigned};
      if(a.action==='state') {
        const roster=await tx.get(db.doc('settings/mutual_aid'));
        if(!roster.data()?.departments?.some((x:{code:string})=>x.code===a.code))throw new Error('Unknown department');
        change={states:{...state.states,[a.code]:a.state}};
      }
      tx.set(ref,{...state,...change,updated_at:Date.now(),updated_by:identity.orgId});
    });
    return Response.json({ok:true});
  }catch{return Response.json({error:'Command was not saved. Retry.'},{status:503});}
}
