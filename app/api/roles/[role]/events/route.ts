import { requireRole } from '@/lib/auth';
import { isRole } from '@/lib/roles';
import { incidentRef, incidentView, initialIncident } from '@/lib/incident';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,ctx:{params:Promise<{role:string}>}) {
  const {role}=await ctx.params;
  if(!isRole(role))return new Response('Unknown role',{status:404});
  let identity;try{identity=await requireRole(role);}catch{return new Response('Forbidden',{status:403});}
  let close=()=>{};
  const stream=new ReadableStream({
    start(controller){
      const encoder=new TextEncoder();
      let stopped=false;
      let queue=Promise.resolve();
      const send=(event:string,data:unknown)=>{if(!stopped)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
      const unsubscribe=incidentRef().onSnapshot(snapshot=>{
        queue=queue.then(async()=>{if(stopped)return;try{send('incident',await incidentView(role,{...initialIncident,...snapshot.data()},identity));}catch{send('failure',{error:'Live inputs unavailable. Displayed values may be stale.'});}});
      },()=>{send('failure',{error:'Live connection lost. Reconnect to refresh.'});close();});
      const heartbeat=setInterval(()=>send('heartbeat',{}),25000);
      const expiry=setTimeout(()=>close(),240000);
      close=()=>{if(stopped)return;stopped=true;unsubscribe();clearInterval(heartbeat);clearTimeout(expiry);request.signal.removeEventListener('abort',close);controller.close();};
      request.signal.addEventListener('abort',close,{once:true});
      if(request.signal.aborted)close();
    },
    cancel(){close();},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
