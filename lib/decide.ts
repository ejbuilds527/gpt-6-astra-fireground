import { z } from 'zod';
import type { FactPack } from './facts';

export const PROPOSE_PROMPT = "You are the water supply advisor on a working structure fire. You NEVER produce a number. Every distance, flow, time and side has already been measured and is in the fact pack. You choose between measured options and say why. Return ONLY JSON matching this shape:\n{\"supply_mode\":{\"pick\":\"\",\"why\":\"\",\"grounded_in\":[]},\"fill_site\":{\"pick\":\"\",\"why\":\"\",\"grounded_in\":[]},\"lay_side_drive\":{\"pick\":\"LEFT|RIGHT\",\"why\":\"\",\"grounded_in\":[]},\"dump_site\":{\"pick\":\"\",\"why\":\"\",\"grounded_in\":[]},\"tanker_count\":{\"pick\":0,\"why\":\"\",\"grounded_in\":[]},\"engine_assignments\":[{\"unit\":\"\",\"direction\":\"LAY IN|LAY OUT|NO LAY\",\"segment\":\"\",\"role_at_end\":\"\"}],\"unreadable\":[]}\nEvery grounded_in entry MUST be a fact id that exists in the pack. A pick you cannot ground is a pick you must not make.";
export const CHALLENGE_PROMPT = "You are an adversarial reviewer on a fire ground decision. You did NOT make this proposal and you have NOT seen the reasoning that produced it. Attack it. Do not grade it, do not praise it. Find what it MISSED, what it asserted on a fact that does not support it, which placement you would have made differently, what fails at 03:00 in the rain, which number is stale, and what is SYNTHETIC being treated as measured. Return ONLY JSON:\n{\"challenges\":[{\"target\":\"\",\"severity\":\"BLOCK|QUESTION|NOTE\",\"claim\":\"\",\"grounded_in\":[],\"test\":\"\",\"would_have_picked\":\"\"}]}\nA challenge you cannot ground in a fact id from the pack is speculation. Discard it yourself.";

export const MODELS = { proposer: 'gpt-6-astra', challenger: 'gpt-5.6-sol' } as const;
export const NEEDS_MEASUREMENT = 'NEEDS A MEASUREMENT';
export const pickNames = ['supply_mode', 'fill_site', 'lay_side_drive', 'dump_site', 'tanker_count'] as const;
const pickSchema = z.object({ pick: z.union([z.string(), z.number().finite(), z.null()]), why: z.string(), grounded_in: z.array(z.string()) }).strict();
const proposalSchema = z.object({
  supply_mode: pickSchema, fill_site: pickSchema, lay_side_drive: pickSchema,
  dump_site: pickSchema, tanker_count: pickSchema,
  engine_assignments: z.array(z.object({ unit: z.string(), direction: z.enum(['LAY IN', 'LAY OUT', 'NO LAY']), segment: z.string(), role_at_end: z.string() }).strict()),
  unreadable: z.array(z.string()),
}).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type AcceptedPick = Proposal['supply_mode'] & { status: 'GROUNDED' | 'REJECTED' | 'NEEDS_MEASUREMENT' };
export type GroundedProposal = Omit<Proposal, typeof pickNames[number]> & Record<typeof pickNames[number], AcceptedPick>;
const grounded = (ids: string[], facts: FactPack) => ids.length > 0 && ids.every(id => Object.hasOwn(facts, id));
export function groundProposal(raw: unknown, facts: FactPack): GroundedProposal {
  const proposal = proposalSchema.parse(raw);
  const result = { ...proposal } as GroundedProposal;
  for (const name of pickNames) {
    const p = proposal[name];
    const empty = p.pick === null || (typeof p.pick === 'string' && !p.pick.trim());
    const valid = grounded(p.grounded_in, facts);
    result[name] = empty || !valid
      ? { pick: NEEDS_MEASUREMENT, why: empty ? 'No measured option was selected.' : 'Rejected: grounding must cite existing fact ids.', grounded_in: [], status: empty ? 'NEEDS_MEASUREMENT' : 'REJECTED' }
      : { ...p, status: 'GROUNDED' };
  }
  return result;
}
const challengeSchema = z.object({ target: z.string(), severity: z.enum(['BLOCK', 'QUESTION', 'NOTE']), claim: z.string(), grounded_in: z.array(z.string()), test: z.string(), would_have_picked: z.string() }).strict();
export type Challenge = z.infer<typeof challengeSchema> & { open: true };
export function groundChallenges(raw: unknown, facts: FactPack): Challenge[] {
  const envelope = z.object({ challenges: z.array(z.unknown()) }).strict().parse(raw);
  return envelope.challenges.flatMap(item => {
    const parsed = challengeSchema.safeParse(item);
    return parsed.success && grounded(parsed.data.grounded_in, facts) ? [{ ...parsed.data, target: parsed.data.target.split('.')[0], open: true as const }] : [];
  });
}
// Separate request, containing decisions and citations only: never the proposer's why or transcript.
export function challengeInput(facts: FactPack, proposal: GroundedProposal): string {
  const picks = Object.fromEntries(pickNames.map(name => [name, { pick: proposal[name].pick, grounded_in: proposal[name].grounded_in }]));
  return 'FACT PACK:\n' + JSON.stringify(facts, null, 1) + '\n\nPROPOSAL UNDER REVIEW:\n' + JSON.stringify({ ...picks, engine_assignments: proposal.engine_assignments, unreadable: proposal.unreadable });
}
export type Check = { target: string; severity: 'BLOCK' | 'UNGRADED'; why: string; grounded_in: string[] };
export function checkProposal(proposal: GroundedProposal, facts: FactPack): Check[] {
  const checks: Check[] = [];
  const value = (id: string) => facts[id]?.value;
  const number = (id: string) => typeof value(id) === 'number' && Number.isFinite(value(id)) ? value(id) as number : undefined;
  const add = (target: string, severity: Check['severity'], why: string, ids: string[]) => checks.push({ target, severity, why, grounded_in: ids.filter(id => Object.hasOwn(facts, id)) });
  const mode = String(proposal.supply_mode.pick).toLowerCase();
  const sourceId = String(proposal.fill_site.pick).replace(/^hydrant\s+/i, '').trim();
  const flowId = `F.HYD.${sourceId}.gpm`;
  const flow = number(flowId), demand = number('F.DEM.gpm');
  if (flow === undefined) add('fill_site', 'UNGRADED', 'Chosen source has no measured flow test.', [flowId]);
  else if (demand === undefined) add('fill_site', 'UNGRADED', 'Demand is not measured.', []);
  else if (flow < demand) add('fill_site', 'BLOCK', 'Chosen hydrant flows less than demand.', [flowId, 'F.DEM.gpm']);
  if (/relay|hydrant|direct/.test(mode)) {
    const have = number('F.APP.hose_first_alarm_ft'), need = number('F.RT.relay.hose_needed_ft');
    if (have === undefined || need === undefined) add('supply_mode', 'UNGRADED', 'Hose carried or required is not measured.', []);
    else if (have < need) add('supply_mode', 'BLOCK', `Hose shortfall: ${need - have} ft.`, ['F.APP.hose_first_alarm_ft', 'F.RT.relay.hose_needed_ft']);
  }
  const crossing = value('F.RT.lay.crosses_road');
  if (crossing === true && value('F.RT.lay.crossing_is_endpoint') !== true) add('lay_side_drive', 'BLOCK', 'Lay crosses a road outside the intended endpoint.', ['F.RT.lay.crosses_road']);
  else if (crossing === undefined) add('lay_side_drive', 'UNGRADED', 'Road crossing has not been measured.', []);
  const overlap = number(`F.STG.${proposal.dump_site.pick}.overlap_pct`);
  if (overlap === undefined) add('dump_site', 'UNGRADED', 'Staging overlap within 20 m has not been measured.', []);
  else if (overlap > 0) add('dump_site', 'BLOCK', 'Staging overlaps the shuttle route.', [`F.STG.${proposal.dump_site.pick}.overlap_pct`]);
  if (/shuttle|dump/.test(mode)) {
    const tank = number('F.TANK.portable_gal'), capacity = number('F.TANKER.capacity_gal');
    if (tank === undefined || capacity === undefined) add('dump_site', 'UNGRADED', 'Portable tank sizing is not measured.', []);
    else if (tank < 1.4 * capacity) add('dump_site', 'BLOCK', 'Portable tank is below 1.4 times tanker capacity.', ['F.TANK.portable_gal', 'F.TANKER.capacity_gal']);
  }
  if (/draft/.test(mode) && number('F.SITE.static_lift_ft') === undefined) add('supply_mode', 'UNGRADED', 'Static lift is not surveyed.', []);
  if (proposal.tanker_count.status === 'GROUNDED' && !(number('F.RT.dump.cycle_min')! > 0)) add('tanker_count', 'BLOCK', 'Tanker count has no routed cycle.', []);
  return checks;
}
export type Stage = 'ASSEMBLE' | 'PROPOSE' | 'CHECK' | 'CHALLENGE' | 'PRESENT';
export type StageEvent = { stage: Stage; elapsed_ms: number; total_elapsed_ms: number; [key: string]: unknown };
export type ModelCall = (model: string, system: string, user: string, signal?: AbortSignal) => Promise<string>;
export async function decide(deps: { assemble: () => Promise<FactPack>; call: ModelCall; emit: (event: StageEvent) => void; signal?: AbortSignal }) {
  const started = performance.now(); let last = started;
  const emit = (stage: Stage, data: Record<string, unknown> = {}) => {
    const now = performance.now(); deps.emit({ stage, elapsed_ms: Math.round(now - last), total_elapsed_ms: Math.round(now - started), ...data }); last = now;
  };
  const facts = await deps.assemble(); emit('ASSEMBLE', { facts, fact_count: Object.keys(facts).length });
  const raw = await deps.call(MODELS.proposer, PROPOSE_PROMPT, 'FACT PACK:\n' + JSON.stringify(facts, null, 1) + '\n\nThe incident commander has confirmed the fire is in the Lodge, at the rear of the campus, up a long single-track private drive. Decide how water reaches this fire.', deps.signal);
  const proposal = groundProposal(JSON.parse(raw), facts);
  emit('PROPOSE', { model: MODELS.proposer });
  const checks = checkProposal(proposal, facts); emit('CHECK', { check_count: checks.length });
  const review = await deps.call(MODELS.challenger, CHALLENGE_PROMPT, challengeInput(facts, proposal), deps.signal);
  const challenges = groundChallenges(JSON.parse(review), facts); emit('CHALLENGE', { model: MODELS.challenger, challenge_count: challenges.length });
  const presentation = { proposal, checks, challenges, models: MODELS, facts,
    status: Object.fromEntries(pickNames.map(name => [name, proposal[name].status !== 'GROUNDED' ? NEEDS_MEASUREMENT : checks.some(c => c.target === name && c.severity === 'BLOCK') || challenges.some(c => c.target === name && c.severity === 'BLOCK') ? 'BLOCK' : checks.some(c => c.target === name && c.severity === 'UNGRADED') ? 'UNGRADED' : 'REVIEWED'])) };
  emit('PRESENT', presentation);
  return presentation;
}
