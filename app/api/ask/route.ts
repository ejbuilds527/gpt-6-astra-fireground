import OpenAI from 'openai';
import { z } from 'zod';
import { db, readSnapshot } from '@/lib/data';
import { attackSnapshot } from '@/lib/attack';
import { runTool, toolDefinitions, schemas, type ToolName, type ToolCall } from '@/lib/tools';
import { sameOrigin } from '@/lib/public-url';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const body=z.object({question:z.string().trim().min(1).max(1000),scenario_id:z.enum(['general-alarm','lodge-confirmed']).optional(),selected_option:z.enum(['SHUTTLE','RELAY','BOTH']).nullable().optional()});
const numberTokens=(s:string)=>[...s.replaceAll(',','').matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Same-origin requests required'},{status:403});
 const input=body.safeParse(await request.json().catch(()=>null));
 if(!input.success)return Response.json({error:'Enter a question up to 1,000 characters.'},{status:400});
 if(!process.env.OPENAI_API_KEY)return Response.json({error:'Astra is unavailable: model credentials are not configured.'},{status:503});
 // A shared transaction bounds this public training demo across all Cloud Run instances.
 try{
  await db.runTransaction(async tx=>{
   const ref=db.doc('runtime/ask_budget');const snapshot=await tx.get(ref);const data=snapshot.data()||{};
   const window=Math.floor(Date.now()/60000);
   const count=data.window===window?data.count||0:0;
   if(count>=10)throw new Error('RATE_LIMIT');
   tx.set(ref,{window,count:count+1});
  });
 }catch{return Response.json({error:'The demo is busy. Please retry in a minute.'},{status:429});}
 const start=performance.now();const calls:ToolCall[]=[];const signal=AbortSignal.timeout(60000);
 try{
  const state=(await db.doc('incidents/training').get()).data()||{};
  const snapshot=attackSnapshot(await readSnapshot(input.data.scenario_id||state.scenario_id||'general-alarm'),state.line_ids);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,project:process.env.OPENAI_PROJECT,timeout:45000,maxRetries:0});
  const model=process.env.OPENAI_MODEL||'gpt-6-astra';
  const items:OpenAI.Responses.ResponseInputItem[]=[{role:'user',content:input.data.question}];
  const tools=toolDefinitions.map(t=>({type:'function' as const,...t.function,strict:false}));
  for(let round=0;round<4;round++){
   const response=await client.responses.create({
    model,store:false,max_output_tokens:2400,reasoning:{effort:'low'},
    instructions:'You are Astra, explaining a TRAINING fireground scenario. Never dispatch, commit, change settings or instruct an unsafe operation. Every numeric fact must come from a tool output in this conversation, copied without new arithmetic. Call water_demand, then relevant source/relay/shuttle tools. At least two distinct tools are required. Use at most three tool rounds, then answer the question directly; do not survey unrelated supply alternatives. Never infer flow from a hydrant color. Keep red tags visible; unknown is not zero. Do not treat stored planning assumptions as measured geometry. Explicitly name synthetic capacity, unmodelled queues, incomplete routing, pressure and staging gaps. Answer in at most 120 words. Cite tool names in brackets. Any lay side is ungraded without checked geometry. The officer decides. Current scenario: '+snapshot.scenarioId+'. Source IDs ordered nearest to farthest for the active incident: '+(snapshot.scenario.hydrant_ranking||[]).map((h:any)=>h.id).join(', ')+'. Relay road-distance input: '+snapshot.relay.road_distance_ft+'. Those identifiers are for tool queries only; use tool outputs for all claims.',
    input:items,tools,
    tool_choice:round===3?'none':round===0?{type:'function',name:'water_demand'}:calls.length<2?'required':'auto',
   },{signal});
   for(const item of response.output) if(item.type==='message'||item.type==='reasoning'||item.type==='function_call')items.push(item);
   const functions=response.output.filter(x=>x.type==='function_call');
   if(!functions.length){
    if(response.status !== 'completed')return Response.json({error:'Astra response was incomplete. Use the tool results; no recommendation was accepted.',tool_calls:calls},{status:502});
    const answer=response.output_text;
    const numbers=new Set(numberTokens(JSON.stringify(calls.map(c=>c.output))));
    const unsupported=numberTokens(answer).filter(n=>!numbers.has(n));
    if(new Set(calls.map(c=>c.name)).size<2 || unsupported.length)
      return Response.json({answer:'Astra’s explanation did not pass tool-evidence validation. Use the measured tool results below; no recommendation was accepted.',tool_calls:calls,model:response.model,elapsed_ms:Math.round(performance.now()-start),validation:'rejected'});
    return Response.json({answer,tool_calls:calls,model:response.model,elapsed_ms:Math.round(performance.now()-start),validation:'numeric tokens match tool results'});
   }
   for(const f of functions.slice(0,8)){
    let output:unknown;
    if(Object.hasOwn(schemas,f.name)){
     const call=await runTool(f.name as ToolName,JSON.parse(f.arguments),snapshot);calls.push(call);output=call.output;
    }else output={value:'unknown',why:'Tool unavailable'};
    items.push({type:'function_call_output',call_id:f.call_id,output:JSON.stringify(output)});
   }
  }
  return Response.json({error:'Astra reached its tool-call limit. The incident calculations are still available.',tool_calls:calls},{status:504});
 }catch{
  return Response.json({error:'Astra could not finish. The arithmetic remains available; no incident decision was changed.',tool_calls:calls},{status:502});
 }
}
