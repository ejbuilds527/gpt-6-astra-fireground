import { withAuth } from '@workos-inc/authkit-nextjs';
import { readSnapshot } from '@/lib/data';
import { runTool, schemas, type ToolName } from '@/lib/tools';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ name: string }> }) {
  const { user } = await withAuth();
  if (!user) return Response.json({ error: 'Sign in required' }, { status:401 });
  const { name } = await context.params;
  if (!Object.hasOwn(schemas,name)) return Response.json({value:'unknown',why:'Unknown tool'}, {status:404});
  try {
    const { scenario_id, ...input } = await request.json();
    return Response.json(await runTool(name as ToolName,input,await readSnapshot(scenario_id)));
  } catch {
    return Response.json({ value:'unknown', why:'Request or stored data unavailable', coefficient:'unknown', assumptions:[] },{status:503});
  }
}
