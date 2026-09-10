import { z } from 'zod';
import { requireRole, sameOrigin } from '@/lib/auth';
import { db, readSnapshot } from '@/lib/data';
import { incidentRef } from '@/lib/incident';
import { settingsInputs } from '@/lib/settings';
import { POST as saveExisting } from '@/app/api/roles/command/settings/route';

export async function GET() {
  try { await requireRole('command'); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  try { return Response.json(settingsInputs(await readSnapshot()), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Settings unavailable' }, { status: 503 }); }
}
const attackSchema = z.object({
  kind: z.literal('attack'), revision: z.number().int().nonnegative(),
  lines: z.array(z.object({ id: z.string().min(1), default_on: z.boolean() })).length(3),
});
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.clone().json().catch(() => null);
  if (body?.kind !== 'attack') return saveExisting(request);
  let who;
  try { who = await requireRole('command'); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  const parsed = attackSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Choose the three recorded attack lines.' }, { status: 400 });
  try {
    await db.runTransaction(async tx => {
      const ref = db.doc('settings/attack_lines');
      const doc = await tx.get(ref);
      const old = doc.data() ?? {};
      if ((old.revision ?? 0) !== parsed.data.revision) throw new Error('CONFLICT');
      const selected = new Map(parsed.data.lines.map(line => [line.id, line.default_on]));
      if (selected.size !== 3 || old.lines?.length !== 3 || old.lines.some((line: {id:string}) => !selected.has(line.id))) throw new Error('LINES');
      tx.update(ref, {
        lines: old.lines.map((line: {id:string}) => ({ ...line, default_on: selected.get(line.id) })),
        revision: parsed.data.revision + 1, edited_by: who.orgName, edited_at: Date.now(),
        provenance: 'EDITED BY ' + who.orgName,
      });
      tx.set(incidentRef(), { updated_at: Date.now(), settings_revision: Date.now() }, { merge: true });
    });
    return Response.json({ ok: true });
  } catch (error) {
    const conflict = error instanceof Error && error.message === 'CONFLICT';
    return Response.json({ error: conflict ? 'Settings changed in another tab. Refresh before saving.' : 'Attack lines were not saved.' }, { status: conflict ? 409 : 503 });
  }
}
