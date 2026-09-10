import OpenAI from 'openai';
import { assembleFacts } from '@/lib/facts';
import { decide, MODELS, type Stage } from '@/lib/decide';
import { loadVisionAssets, measureVision, VISION_PROMPT } from '@/lib/vision';
import { sameOrigin } from '@/lib/public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

// OPENAI_API_KEY is mounted on the service from Secret Manager openai-api-key.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Same-origin requests required' }, { status: 403 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'Model credentials are not configured.' }, { status: 503 });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: process.env.OPENAI_PROJECT, timeout: 240000, maxRetries: 0 });
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(590000)]);
  const encoder = new TextEncoder();
  let cancelled = false;
  let completedStage: Stage | null = null;
  const started = performance.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { if (!cancelled && !request.signal.aborted) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      try {
        await decide({ assemble: assembleFacts, signal, emit: data => { completedStage = data.stage; send(data.stage, data); },
          vision: async () => {
            const assets = await loadVisionAssets();
            signal.throwIfAborted();
            const response = await client.chat.completions.create({ model: MODELS.proposer, messages: [
              { role: 'system', content: VISION_PROMPT },
              { role: 'user', content: [
                { type: 'text', text: 'Trace the private drive from Valley Rd to the Lodge (Michael’s House), Silver Hill Hospital. Identify the structure centroid and visible obstructions. If either endpoint is outside this frame, explicitly report it as unreadable. Never supply a distance.' },
                { type: 'image_url', image_url: { url: assets.image } },
              ] },
            ] }, { signal });
            const choice = response.choices[0];
            if (choice?.finish_reason !== 'stop' || !choice.message.content) throw new Error('Incomplete vision response');
            return measureVision(JSON.parse(choice.message.content), assets.frame, assets.source);
          },
          call: async (model, system, user, signal) => {
            const response = await client.chat.completions.create({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, { signal });
            const choice = response.choices[0];
            if (choice?.finish_reason !== 'stop' || !choice.message.content) throw new Error('Incomplete model response');
            return choice.message.content;
          },
        });
      } catch {
        send('ERROR', { error: 'Decision could not complete. NEEDS A MEASUREMENT', status: 'NEEDS A MEASUREMENT', completed_stage: completedStage, total_elapsed_ms: Math.round(performance.now() - started), proposal_withheld: true });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
