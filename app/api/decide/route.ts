import OpenAI from 'openai';
import { assembleFacts, assembleAdversarialRubric } from '@/lib/facts';
import { decide, MODELS, type Stage } from '@/lib/decide';
import { loadVisionAssets, measureVision, VISION_PROMPT } from '@/lib/vision';
import { sameOrigin } from '@/lib/public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

// One JSON object per stage, newline delimited, so a client can fill a visible clock as each lands.
const STAGE_NUMBER: Record<Stage, number> = { ASSEMBLE: 1, PROPOSE: 2, CHECK: 3, CHALLENGE: 4, PRESENT: 5 };
const STAGE_ACTOR: Record<Stage, string> = { ASSEMBLE: 'code', PROPOSE: MODELS.proposer, CHECK: 'code', CHALLENGE: MODELS.challenger, PRESENT: 'code' };

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
      const send = (chunk: Record<string, unknown>) => { if (!cancelled && !request.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n')); };
      try {
        await decide({ assemble: assembleFacts, signal, rubric: () => assembleAdversarialRubric(),
          emit: ({ stage, elapsed_ms, total_elapsed_ms, ...payload }) => {
            completedStage = stage;
            send({ stage: STAGE_NUMBER[stage], name: stage, by: STAGE_ACTOR[stage], elapsedMs: elapsed_ms, totalElapsedMs: total_elapsed_ms, payload });
          },
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
        send({ stage: 0, name: 'ERROR', by: 'code', elapsedMs: Math.round(performance.now() - started), totalElapsedMs: Math.round(performance.now() - started), payload: { error: 'Decision could not complete. NEEDS A MEASUREMENT', status: 'NEEDS_A_MEASUREMENT', completed_stage: completedStage, proposal_withheld: true } });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
