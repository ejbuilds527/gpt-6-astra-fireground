import { z } from 'zod';
import type { FactPack } from './facts';
import { visionFacts, type VisionMeasurement } from './vision';

export const PROPOSE_PROMPT = "You are the water supply advisor on a working structure fire. You NEVER produce a number. Measured values and explicitly labelled unknowns are in the fact pack. A trace is not a survey, and an absent measurement must remain unknown. You choose between measured options and say why. Return ONLY JSON matching this shape:\n{\"supply_mode\":{\"pick\":\"\",\"why\":\"\",\"grounded_in\":[]},\"fill_site\":{\"pick\":\"\",\"why\":\"\",\"grounded_in\":[]},\"lay_side_drive\":{\"pick\":\"LEFT|RIGHT\",\"why\":\"\",\"grounded_in\":[],\"missing\":[]},\"lay_side_street\":{\"pick\":\"LEFT|RIGHT\",\"why\":\"\",\"grounded_in\":[],\"missing\":[]},\"crossings\":[{\"where\":\"\",\"why_unavoidable\":\"\",\"grounded_in\":[]}],\"dump_site\":{\"pick\":\"\",\"why\":\"\",\"grounded_in\":[]},\"tanker_count\":{\"pick\":0,\"why\":\"\",\"grounded_in\":[]},\"engine_assignments\":[{\"unit\":\"\",\"direction\":\"LAY IN|LAY OUT|NO LAY\",\"segment\":\"\",\"role_at_end\":\"\"}],\"unreadable\":[]}\nEvery grounded_in entry MUST be a fact id that exists in the pack. A pick you cannot ground is a pick you must not make. When a rule cannot be evaluated because a measurement is absent, leave pick empty and name the absent fact ids in missing.";
export const CHALLENGE_PROMPT = "You are an adversarial reviewer on a fire ground decision. You did NOT make this proposal and you have NOT seen the reasoning that produced it. Attack it. Do not grade it, do not praise it. Find what it MISSED, what it asserted on a fact that does not support it, which placement you would have made differently, what fails at 03:00 in the rain, which number is stale, and what is SYNTHETIC being treated as measured. Return ONLY JSON:\n{\"challenges\":[{\"target\":\"\",\"severity\":\"BLOCK|QUESTION|NOTE\",\"claim\":\"\",\"grounded_in\":[],\"test\":\"\",\"would_have_picked\":\"\"}]}\nA challenge you cannot ground in a fact id from the pack is speculation. Discard it yourself. Do not compute or invent numerical claims; quote only values present in your cited facts.";

export const MODELS = { proposer: 'gpt-6-astra', challenger: 'gpt-5.6-sol' } as const;
export const NEEDS_MEASUREMENT = 'NEEDS A MEASUREMENT';
export const pickNames = ['supply_mode', 'fill_site', 'lay_side_drive', 'lay_side_street', 'dump_site', 'tanker_count', 'staging'] as const;
const pickSchema = z.object({ pick: z.union([z.string(), z.number().finite(), z.null()]), why: z.string(), grounded_in: z.array(z.string()), missing: z.array(z.string()).default([]) }).strict();
const proposalSchema = z.object({
  supply_mode: pickSchema, fill_site: pickSchema, lay_side_drive: pickSchema,
  lay_side_street: pickSchema.default({ pick: null, why: 'No street side was selected.', grounded_in: [], missing: [] }),
  crossings: z.array(z.object({ where: z.string(), why_unavoidable: z.string(), grounded_in: z.array(z.string()) }).strict()).default([]),
  dump_site: pickSchema, tanker_count: pickSchema,
  staging: pickSchema.default({ pick: null, why: 'Staging was not selected.', grounded_in: [], missing: [] }),
  engine_assignments: z.array(z.object({ unit: z.string(), direction: z.enum(['LAY IN', 'LAY OUT', 'NO LAY']), segment: z.string(), role_at_end: z.string(), grounded_in: z.array(z.string()).default([]) }).strict()),
  unreadable: z.array(z.string()),
}).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type AcceptedPick = Proposal['supply_mode'] & { status: 'GROUNDED' | 'REJECTED' | 'NEEDS_A_MEASUREMENT' };
export type GroundedProposal = Omit<Proposal, typeof pickNames[number]> & Record<typeof pickNames[number], AcceptedPick>;
const grounded = (ids: string[], facts: FactPack) => ids.length > 0 && ids.every(id => Object.hasOwn(facts, id));
// Prose may quote measured numbers, but may not introduce its own arithmetic.
const numerals = (text: string) => text.match(/(?<![A-Za-z])\d+(?:\.\d+)?/g) || [];
function numbersGrounded(text: string, ids: string[], facts: FactPack) {
  const allowed = new Set(ids.flatMap(id => numerals(id + ' ' + JSON.stringify(facts[id]?.value))));
  return numerals(text).every(n => allowed.has(n));
}
export function groundProposal(raw: unknown, facts: FactPack): GroundedProposal {
  const proposal = proposalSchema.parse(raw);
  const result = { ...proposal } as GroundedProposal;
  for (const name of pickNames) {
    const p = proposal[name];
    const empty = p.pick === null || (typeof p.pick === 'string' && !p.pick.trim());
    const valid = grounded(p.grounded_in, facts) && numbersGrounded(p.why, p.grounded_in, facts)
      && (name !== 'tanker_count' || typeof p.pick === 'number' && Number.isInteger(p.pick) && p.pick > 0 && p.grounded_in.some(id => facts[id]?.unit === 'tankers' && facts[id]?.value === p.pick));
    // A refusal names what is absent, so the officer knows which measurement unblocks the pick.
    const absent = [...new Set([...p.missing, ...p.grounded_in.filter(id => !Object.hasOwn(facts, id))])];
    result[name] = empty || !valid
      ? { pick: NEEDS_MEASUREMENT, why: empty ? 'No measured option was selected.' : 'Rejected: citations and numeric claims must be supported by the fact pack.', grounded_in: [], missing: absent, status: empty ? 'NEEDS_A_MEASUREMENT' : 'REJECTED' }
      : { ...p, missing: [], status: 'GROUNDED' };
  }
  // Assignments are decisions too; the Python shape omitted their citations.
  result.crossings = proposal.crossings.filter(c => grounded(c.grounded_in, facts) && numbersGrounded(c.where + ' ' + c.why_unavoidable, c.grounded_in, facts));
  result.engine_assignments = proposal.engine_assignments.filter(p => grounded(p.grounded_in, facts) && numbersGrounded(JSON.stringify({unit:p.unit,segment:p.segment,role_at_end:p.role_at_end}), p.grounded_in, facts));
  return result;
}
const challengeSchema = z.object({ target: z.string(), severity: z.enum(['BLOCK', 'QUESTION', 'NOTE']), claim: z.string(), grounded_in: z.array(z.string()), test: z.string(), would_have_picked: z.string() }).strict();
export type Challenge = z.infer<typeof challengeSchema> & { open: true };
export function groundChallenges(raw: unknown, facts: FactPack): Challenge[] {
  const envelope = z.object({ challenges: z.array(z.unknown()) }).strict().parse(raw);
  return envelope.challenges.flatMap(item => {
    const parsed = challengeSchema.safeParse(item);
    return parsed.success && grounded(parsed.data.grounded_in, facts) && numbersGrounded(parsed.data.claim + ' ' + parsed.data.test + ' ' + parsed.data.would_have_picked, parsed.data.grounded_in, facts) ? [{ ...parsed.data, target: parsed.data.target.split('.')[0], open: true as const }] : [];
  });
}
// Separate request, containing decisions and citations only: never the proposer's why or transcript.
export function challengeInput(facts: FactPack, proposal: GroundedProposal): string {
  const picks = Object.fromEntries(pickNames.map(name => [name, { pick: proposal[name].pick, grounded_in: proposal[name].grounded_in }]));
  return 'FACT PACK:\n' + JSON.stringify(facts, null, 1) + '\n\nPROPOSAL UNDER REVIEW:\n' + JSON.stringify({ ...picks, crossings: proposal.crossings, engine_assignments: proposal.engine_assignments });
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
  const stageId = proposal.staging.status === 'GROUNDED' ? proposal.staging.pick : proposal.dump_site.pick;
  const stageTarget = proposal.staging.status === 'GROUNDED' ? 'staging' : 'dump_site';
  const overlap = number(`F.STG.${stageId}.overlap_pct`);
  if (overlap === undefined) add(stageTarget, 'UNGRADED', 'Staging overlap within 20 m has not been measured.', []);
  else if (overlap > 0) add(stageTarget, 'BLOCK', 'Staging overlaps the shuttle route.', [`F.STG.${stageId}.overlap_pct`]);
  if (/pond|dump|draft/.test(mode) && !/nurse/.test(mode)) {
    const tank = number('F.TANK.portable_gal'), capacity = number('F.TANKER.capacity_gal');
    if (tank === undefined || capacity === undefined) add('dump_site', 'UNGRADED', 'Portable tank sizing is not measured.', []);
    else if (tank < 1.4 * capacity) add('dump_site', 'BLOCK', 'Portable tank is below 1.4 times tanker capacity.', ['F.TANK.portable_gal', 'F.TANKER.capacity_gal']);
  }
  if (/draft|pond|shuttle_dump/.test(mode) && number('F.SITE.static_lift_ft') === undefined) add('supply_mode', 'UNGRADED', 'Static lift is not surveyed.', []);
  if (!(number('F.RT.dump.cycle_min')! > 0) || !(number('F.RT.dump.out_min')! > 0) || !(number('F.RT.dump.back_min')! > 0)) add('tanker_count', 'BLOCK', 'Tanker count has no routed cycle with separately measured outbound and return legs.', ['F.RT.dump.cycle_min', 'F.RT.dump.out_min', 'F.RT.dump.back_min']);
  if (!value('F.RT.dump.surveyed')) add('dump_site', 'UNGRADED', 'Dump-site footprint and access are not surveyed.', ['F.RT.dump.not_surveyed']);
  const finalOverlap = number('F.RT.stage_to_scene.overlap_pct');
  if (finalOverlap !== undefined && finalOverlap > 0) add('staging', 'BLOCK', 'Final approach from staging overlaps the shuttle route.', ['F.RT.stage_to_scene.overlap_pct']);
  if (/red.?tag|out.of.service/i.test(String(value(`F.HYD.${sourceId}.status`)))) add('fill_site','BLOCK','Chosen hydrant is red-tagged or out of service.',[`F.HYD.${sourceId}.status`]);
  // A trace that disagrees with the record has not measured the same drive. Measured 2026-09-10:
  // the GCS frame is zoom 18, the drive needs zoom 17, so the model traced only the visible part.
  const traced = number('F.VISION.driveway_ft'), recorded = number('F.SITE.driveway_ft');
  if (traced !== undefined && recorded !== undefined && recorded > 0 && Math.abs(traced - recorded) / recorded > 0.25)
    add('lay_side_drive', 'UNGRADED', `The satellite trace measured ${Math.round(traced)} ft against a recorded ${recorded} ft. One of the two does not cover the whole drive, so the trace is not a measurement of it.`, ['F.VISION.driveway_ft', 'F.SITE.driveway_ft']);
  // R6: the drop is where two crews meet, so a crossing there is a road closure and a trip hazard.
  for (const c of proposal.crossings) {
    if (/\b(drop|handoff|hand-off|driveway entry|drive entry)\b/i.test(c.where)) add('lay_side_street', 'BLOCK', `R6: a crossing at the drop is refused. Named: ${c.where}.`, c.grounded_in);
  }
  // R5: cross at most once, and only at the source.
  if (proposal.crossings.length > 1) add('lay_side_street', 'BLOCK', `R5: ${proposal.crossings.length} crossings proposed; at most one, at the source, is permitted.`, proposal.crossings.flatMap(c => c.grounded_in));
  // R4: stay on the side the driveway connects to unless a crossing accounts for leaving it.
  const connectSide = value('F.SITE.drive_side_of_street');
  if (proposal.lay_side_street.status === 'GROUNDED') {
    if (typeof connectSide !== 'string') add('lay_side_street', 'UNGRADED', 'R4 cannot be evaluated: the side the driveway connects to is not computed.', ['F.SITE.drive_side_of_street']);
    else if (proposal.lay_side_street.pick !== connectSide && proposal.crossings.length === 0) add('lay_side_street', 'BLOCK', `R4: the driveway connects to the ${connectSide} side and no crossing accounts for leaving it.`, ['F.SITE.drive_side_of_street']);
    if (!proposal.lay_side_street.grounded_in.some(id => /street_direction|drive_direction|street_polyline/.test(id))) add('lay_side_street', 'UNGRADED', 'R2: a side is meaningless without the direction of travel it is relative to.', proposal.lay_side_street.grounded_in);
  }
  if (proposal.lay_side_drive.status === 'GROUNDED' && !proposal.lay_side_drive.grounded_in.some(id => /drive_polyline|drive_obstructions|drive_shoulder|obstruction_hints|lay_side/.test(id))) add('lay_side_drive','UNGRADED','A length alone does not establish a lay side. Geometry and side evidence are required.',proposal.lay_side_drive.grounded_in);
  return checks;
}
export type Stage = 'ASSEMBLE' | 'PROPOSE' | 'CHECK' | 'CHALLENGE' | 'PRESENT';
export type StageEvent = { stage: Stage; elapsed_ms: number; total_elapsed_ms: number; [key: string]: unknown };
export type ModelCall = (model: string, system: string, user: string, signal?: AbortSignal) => Promise<string>;
export async function decide(deps: { assemble: () => Promise<FactPack>; call: ModelCall; emit: (event: StageEvent) => void; signal?: AbortSignal; vision?: () => Promise<VisionMeasurement>; rubric?: () => Promise<string[]> }) {
  const started = performance.now(); let last = started;
  const emit = (stage: Stage, data: Record<string, unknown> = {}) => {
    const now = performance.now(); deps.emit({ stage, elapsed_ms: Math.round(now - last), total_elapsed_ms: Math.round(now - started), ...data }); last = now;
  };
  const facts = await deps.assemble(); emit('ASSEMBLE', { facts: { ...facts }, fact_count: Object.keys(facts).length });
  deps.signal?.throwIfAborted();
  let vision: VisionMeasurement | null = null;
  let visionError: string | null = null;
  if (deps.vision) {
    try { vision = await deps.vision(); Object.assign(facts, visionFacts(vision)); }
    catch { deps.signal?.throwIfAborted(); visionError = 'NEEDS A MEASUREMENT — satellite interpretation unavailable; stored measurements remain usable.'; }
  }
  const raw = await deps.call(MODELS.proposer, PROPOSE_PROMPT + '\nAlso return staging as a pick/why/grounded_in object. Every crossing must carry grounded_in fact ids. Apply F.RULE.R1 to F.RULE.R11 in the pack, under F.RULE.precedence. R11 governs a pick you cannot ground: leave it empty and list the absent fact ids in missing. Every engine_assignment must carry grounded_in fact ids. Use null for any unmeasured choice. Use exact identifiers in pick (e.g. 1-18, CT-106, RIGHT); put qualifications only in why. Never compute a number; copy tanker_count only from a cited fact with unit tankers. Any numeric claim in prose must appear in the cited facts. Vision facts are uncertain observations, never surveyed clearances. Never infer a lay side from a scalar length alone.', 'FACT PACK:\n' + JSON.stringify(facts, null, 1) + '\n\nThe incident commander has confirmed the fire is in the Lodge, at the rear of the campus, up a long single-track private drive. Decide how water reaches this fire.', deps.signal);
  const proposal = groundProposal(JSON.parse(raw), facts);
  emit('PROPOSE', { model: MODELS.proposer, vision, vision_error: visionError });
  const checks = checkProposal(proposal, facts); emit('CHECK', { check_count: checks.length });
  // settings/adversarial_rubric is the REVIEWER's own instruction sheet. It carries no proposer
  // reasoning, so stage 4 still sees the fact pack, the picks and nothing about how they were made.
  const rubric = deps.rubric ? await deps.rubric().catch(() => [] as string[]) : [];
  const challengeSystem = rubric.length ? CHALLENGE_PROMPT + '\nTest every check below and name the one you fire:\n' + rubric.join('\n') : CHALLENGE_PROMPT;
  const review = await deps.call(MODELS.challenger, challengeSystem, challengeInput(facts, proposal), deps.signal);
  const challenges = groundChallenges(JSON.parse(review), facts); emit('CHALLENGE', { model: MODELS.challenger, challenge_count: challenges.length });
  const presentation = { proposal, checks, challenges, models: MODELS, facts, vision, vision_error: visionError,
    overall_status: checks.some(c => c.severity === 'BLOCK') || challenges.some(c => c.severity === 'BLOCK') ? 'BLOCK' : checks.some(c => c.severity === 'UNGRADED') || pickNames.some(name => proposal[name].status !== 'GROUNDED') ? 'UNGRADED' : 'REVIEWED',
    status: Object.fromEntries(pickNames.map(name => [name, proposal[name].status !== 'GROUNDED' ? NEEDS_MEASUREMENT : checks.some(c => c.target === name && c.severity === 'BLOCK') || challenges.some(c => (c.target === name || !pickNames.includes(c.target as typeof pickNames[number])) && c.severity === 'BLOCK') ? 'BLOCK' : checks.some(c => c.target === name && c.severity === 'UNGRADED') ? 'UNGRADED' : 'REVIEWED'])) };
  emit('PRESENT', presentation);
  return presentation;
}
