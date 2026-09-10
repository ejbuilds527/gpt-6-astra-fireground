import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Proof that the OpenAI key reached the container, and nothing more.
//
// The key is mounted from Secret Manager as OPENAI_API_KEY. It is never read on
// the client and never returned in a response -- this route reports only whether
// a call SUCCEEDED, plus the model that answered.
//
// OPENAI_PROJECT scopes the call to the hackathon project. A key issued inside a
// project needs it; a legacy user key ignores it.
//
// This route is UNAUTHENTICATED so it can be curled, which means anyone can make it
// spend tokens. It uses gpt-5-nano with an 8-token cap so the cost of abuse is
// negligible. Do not copy this pattern for a route that does real work.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, reason: 'OPENAI_API_KEY is not set on this revision' },
      { status: 503 },
    );
  }

  const client = new OpenAI({ apiKey: key, project: process.env.OPENAI_PROJECT });

  try {
    const r = await client.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      max_completion_tokens: 8,
    });
    return NextResponse.json({
      ok: true,
      model: r.model,
      reply: r.choices[0]?.message?.content?.trim() ?? '',
    });
  } catch (e) {
    // The message is returned so a failure names itself. It carries no key.
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ ok: false, reason: message }, { status: 502 });
  }
}
