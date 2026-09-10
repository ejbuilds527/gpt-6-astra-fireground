import OpenAI from 'openai';
import { assembleFacts } from '@/lib/facts';
import { decide } from '@/lib/decide';
import { sameOrigin } from '@/lib/public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 400;

// OPENAI_API_KEY is mounted on the service from Secret Manager openai-api-key.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Same-origin requests required' }, { status: 403 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'Model credentials are not configured.' }, { status: 503 });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: process.env.OPENAI_PROJECT, timeout: 180000, maxRetries: 0 });
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(390000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { if (!signal.aborted) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      try {
        await decide({ assemble: assembleFacts, signal, emit: data => send(data.stage, data),
          call: async (model, system, user, signal) => {
            const response = await client.chat.completions.create({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, { signal });
            const choice = response.choices[0];
            if (choice?.finish_reason !== 'stop' || !choice.message.content) throw new Error('Incomplete model response');
            return choice.message.content;
          },
        });
      } catch {
        send('ERROR', { error: 'Decision could not complete. NEEDS A MEASUREMENT', status: 'NEEDS A MEASUREMENT' });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
