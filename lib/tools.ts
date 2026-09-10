import { z } from 'zod';
import { hoseInventory } from './apparatus';
import { shuttleFacts } from './shuttle';
import { nearestSegment,points,routeOverlap } from './geometry';
import type { Document, Snapshot } from './data';
import { demand, frictionLoss, margin, maxSegment, positive, requiredDischarge, segmentCount, shuttleCycle, tankSeconds, unknown, valid } from './water';
const n = z.number().finite().nonnegative();
export const schemas = {
  hydrant_side_of_road: z.object({id:z.string(),route:z.enum(['outbound','return'])}),
  route_overlap: z.object({route_a:z.string(),route_b:z.string(),tolerance_m:n}),
  staging_candidates: z.object({bearing:z.string().optional()}),
  measure_lay: z.object({ from: z.string(), to: z.string().optional() }),
  water_demand: z.object({ line_ids: z.array(z.string()).max(30).optional() }),
  friction_loss: z.object({ hose: z.string(), gpm: n, length: n, elevation_psi: z.number().finite().optional(), appliance_psi: n.optional() }),
  segment_plan: z.object({ distance_ft: n, hose: z.string().optional(), gpm: n.optional(), elevation_psi: z.number().finite().optional(), appliance_psi: n.optional() }),
  source_feasibility: z.object({ id: z.string(), demand: n.optional() }),
  shuttle_plan: z.object({ loop: z.literal('shuttle-loop').optional(), tankers: z.array(z.string()).min(1).optional(), demand: n.optional() }),
  mutual_aid_bearings: z.object({ selected_option: z.enum(['SHUTTLE','RELAY','BOTH']).optional() }),
};
export type ToolName = keyof typeof schemas;
export type ToolOutput = { value: any; coefficient: any; assumptions: string[]; why?: string };
export type ToolCall = { name: string; input: Record<string, unknown>; output: ToolOutput; ms: number };
export const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const known = (value: any, coefficient: any, assumptions: string[]): ToolOutput => ({ value, coefficient, assumptions });
const missing = (why: string, assumptions: string[] = []): ToolOutput => ({ ...unknown(why), coefficient: 'unknown', assumptions });
function flowDemand(d: Snapshot) { return demand((d.settings.attack_scenario?.lines ?? []).map((l: Document) => l.gpm)); }
function coeff(d: Snapshot, hose: string) {
  const [group, key] = hose.includes('/') ? hose.split('/') : ['single_line', hose];
  return d.settings.friction_coefficients?.[group]?.[key];
}
export function evaluateTool(name: ToolName, raw: unknown, d: Snapshot): ToolOutput {
  const parsed = schemas[name].safeParse(raw);
  if (!parsed.success) return missing(`Invalid input: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const a = parsed.data as Document;
  const p = d.settings.policy ?? {};
  const defaultDemand = flowDemand(d);
  const gpm = a.demand ?? (defaultDemand.value === 'unknown' ? undefined : defaultDemand.value);
  const provenance = [`Live Firestore; scenario: ${d.scenarioId}`, p.disclaimer ?? 'Training decision support'];
  const routeGeometry = (id:string) => {
    const routes:Document = {outbound:d.shuttle.outbound,return:d.shuttle.return,...(d.settings.staging_gap?.routes||{})};
    const route=routes[id];return points(route?.polyline?.points??route?.polyline??route?.geometry);
  };
  if(name==='hydrant_side_of_road'){
    const route=routeGeometry(a.route);
    const h=[...(d.site.hydrants||[]),...(d.sources.hydrants||[])].find((h:Document)=>(h.id||h.facility_id)===a.id);
    const point={lat:h?.lat??h?.latitude,lon:h?.lon??h?.longitude};
    if(route.length<2||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return missing('Hydrant coordinates or directed route polyline missing',provenance);
    const result=nearestSegment(point,route);
    return known({...result,offset_m:round(result.offset_m,1),id:a.id,route:a.route,closes_street:result.side==='LEFT'},null,[...provenance,'Side is relative to the stored route direction. Road closure is the far-side connection planning rule, not a surveyed traffic-control plan.']);
  }
  if(name==='route_overlap'){
    const ra=routeGeometry(a.route_a),rb=routeGeometry(a.route_b);
    if(ra.length<2||rb.length<2)return missing('Both directed route polylines must be stored',provenance);
    return known(routeOverlap(ra,rb,a.tolerance_m),{tolerance_m:a.tolerance_m},provenance);
  }
  if(name==='staging_candidates'){
    const gap=d.settings.staging_gap||{};
    return known({point:gap.chosen||'NOT SET',status:gap.status||'ungraded',measured_overlap:gap.measured_overlap||'unknown',reason:gap.what_that_means||gap.not_chosen,parking_lots:gap.parking_lots_NOT_SURVEYED,requested_bearing:a.bearing||'all'},null,[...provenance,'Candidate and precomputed overlap are supplied records. No surveyed parking lot is inferred.']);
  }
  if (name === 'water_demand') {
    const attack = d.settings.attack_scenario;
    const presets = d.settings.attack_lines?.lines ?? d.settings.attack_lines?.presets ?? [];
    const lines = a.line_ids ? a.line_ids.map((id: string) => presets.find((l: Document) => l.id === id) ?? attack?.lines?.find((l: Document) => l.name === id)) : attack?.lines;
    if (Array.isArray(lines) && lines.length === 0) return known({gpm:0,tank_seconds:'not flowing',lines:[],available_lines:presets},null,provenance);
    if (!lines?.length || lines.some((l: Document | undefined) => !l || !positive(l.gpm))) return missing('A selected line has no stored flow; select a stored line ID or name', provenance);
    const total = demand(lines.map((l: Document) => l.gpm));
    if (total.value === 'unknown') return missing(total.why, provenance);
    const tank = tankSeconds(attack?.tank_gallons, total.value);
    return known({ gpm: total.value, tank_seconds: typeof tank.value === 'number' ? Math.floor(tank.value) : tank, tank_gallons: attack?.tank_gallons ?? 'unknown', lines, available_lines: presets }, { formula: 'sum(line gpm); tank gallons / demand × seconds per minute', tank_gallons: attack?.tank_gallons ?? 'unknown' }, [...provenance, 'Repeated line IDs mean additional lines. Tank duration rounds down. No refill during tank-only interval.', attack?.note ?? 'Attack assignment metadata unavailable']);
  }
  if (name === 'measure_lay') {
    if (a.to && ![d.scenarioId, 'incident', d.scenario.building].includes(a.to)) return missing('Destination is not the active incident; no measured route exists', provenance);
    const entry = d.scenario.hydrant_ranking?.find((r: Document) => r.id === a.from);
    const isDriveway = a.from === 'driveway';
    const distance = isDriveway ? d.scenario.driveway_ft : entry?.ft;
    if (!positive(distance) || !positive(p.hose_section_ft)) return missing('No stored distance or hose section length for these endpoints', provenance);
    return known({ from: a.from, to: d.scenarioId, distance_ft: distance, sections: Math.ceil(distance / p.hose_section_ft), distance_kind: isDriveway ? 'stored driveway length' : 'point-to-point distance, not a surveyed hose lay', crosses_road: unknown('No lay polyline and road centreline are stored; crossing test ungraded'), chosen_side: unknown('No measured side-of-driveway candidate is stored'), location_confidence: d.scenario.location_confidence }, { hose_section_ft: p.hose_section_ft, distance_source: `scenarios/${d.scenarioId}` }, [...provenance, 'Distances are read from measured scenario rankings; sections round up. Point-to-point lengths do not account for obstacles.', d.scenario.driveway_note ?? d.scenario.location_confidence]);
  }
  if (name === 'friction_loss') {
    const c = coeff(d, a.hose);
    const loss = frictionLoss(c, a.gpm, a.length);
    const per = frictionLoss(c, a.gpm, 100);
    if (loss.value === 'unknown' || per.value === 'unknown') return missing('Hose coefficient, flow or length is missing or invalid', provenance);
    const discharge = requiredDischarge(loss.value, p.receiving_intake_target_psi, a.elevation_psi, a.appliance_psi);
    const reserve = discharge.value === 'unknown' ? discharge : margin(discharge.value, p.hose_max_operating_psi, p.department_discharge_cap_psi);
    return known({ psi_per_100: round(per.value), total: round(loss.value), discharge: typeof discharge.value === 'number' ? round(discharge.value) : discharge, margin: typeof reserve.value === 'number' ? round(reserve.value) : reserve, required_margin_psi: p.safety_margin_psi ?? 'unknown', hose: a.hose, gpm: a.gpm, length_ft: a.length }, { C: c, formula: 'C × (gpm / 100)² × (length_ft / 100)', intake_psi: p.receiving_intake_target_psi, hose_max_psi: p.hose_max_operating_psi, department_cap_psi: p.department_discharge_cap_psi, elevation_psi: a.elevation_psi ?? 'unknown', appliance_psi: a.appliance_psi ?? 'unknown', source: d.settings.friction_coefficients?.source }, [...provenance, d.settings.friction_coefficients?.caution ?? 'Coefficient provenance unknown', 'Missing elevation or appliance losses prevent a discharge or safety-margin verdict.']);
  }
  if (name === 'segment_plan') {
    const c = coeff(d, a.hose ?? '5_inch');
    const actualFlow = a.gpm ?? gpm;
    const hydraulic = maxSegment(c, actualFlow, p as any, a.elevation_psi, a.appliance_psi);
    const frictionOnly = maxSegment(c, actualFlow, p as any, 0, 0);
    const ceiling = typeof hydraulic.value === 'number' ? hydraulic.value : frictionOnly.value;
    const recommended = typeof ceiling === 'number' ? Math.min(ceiling, p.recommended_segment_ft) : p.recommended_segment_ft;
    const counts = segmentCount(a.distance_ft, recommended, p.hose_section_ft);
    if (counts.value === 'unknown') return missing(counts.why, provenance);
    const inventory = hoseInventory(d);
    const carried = inventory.first_alarm.known_ft;
    return known({ ...counts.value, recommended_segment_ft: recommended, hydraulic_max_segment_ft: hydraulic, friction_only_max_segment_ft:frictionOnly, hydraulic_verdict: hydraulic.value === 'unknown' ? 'ungraded' : 'computed', hose_inventory: inventory, hose_shortfall_ft: inventory.first_alarm.verdict === 'UNGRADED' ? unknown('First-alarm hose or staffing is unrecorded') : Math.max(0, counts.value.hose_ft - carried), road_distance_ft: a.distance_ft }, { C: c, gpm: actualFlow, policy: p, hose_carried_ft: carried ?? 'unknown' }, [...provenance, 'Segment counts are a friction-only planning layout capped by department policy; exclude unknown elevation and appliance losses. Hydraulic feasibility remains ungraded until those are measured.', d.relay.caution, d.settings.apparatus?.synthetic ? 'Apparatus inventory is SYNTHETIC; confirm actual carried hose.' : 'Inventory from settings/apparatus'].filter(Boolean));
  }
  if (name === 'source_feasibility') {
    const h = [...(d.site.hydrants ?? []), ...(d.sources.hydrants ?? [])].find(h => (h.facility_id ?? h.id) === a.id);
    if (!h) return missing('Source is not in the stored hydrant records', provenance);
    const status = d.scenario.hydrant_status?.[a.id] ?? d.scenario.hydrant_ranking?.find((r: Document) => r.id === a.id)?.status;
    const out = typeof status === 'string' && status.toUpperCase().replaceAll(' ', '_') === 'OUT_OF_SERVICE';
    const testTime = Date.parse(h.last_flow_test);
    const age = Number.isFinite(testTime) ? Math.floor((Date.now() - testTime) / 86400000) : undefined;
    const hasFlow = positive(h.flow_gpm) && Number.isFinite(testTime);
    const delta = hasFlow && positive(gpm) ? round(h.flow_gpm - gpm) : undefined;
    const verdict = out ? 'RED-TAGGED' : !hasFlow || !positive(gpm) ? 'ungraded' : delta! < 0 ? 'insufficient' : 'conditional';
    const why = out ? d.scenario.out_of_service_reason : !hasFlow ? 'No numeric flow test is available. A colour class is not a measured capacity.' : !positive(gpm) ? 'Demand is unknown' : delta! < 0 ? 'Tested flow is below attack demand.' : 'Tested flow exceeds demand; current flow, pressure and access still require field confirmation.';
    return known({ id: a.id, verdict, gpm: hasFlow ? h.flow_gpm : unknown('No numeric flow test'), demand_gpm: gpm ?? 'unknown', margin_gpm: delta ?? unknown('Flow test or demand missing'), limiting_component: out ? 'out-of-service hydrant' : 'tested source flow; downstream pressure not verified', why, ownership: h.ownership ?? h.dept ?? 'unknown', last_flow_test: h.last_flow_test || 'unknown', flow_test_age_days: age ?? 'unknown', stored_flow_test_age_days: h.flow_test_age_days ?? 'unknown', stale: h.stale ?? 'unknown', flow_class: h.nfpa_291_class ?? h.cls ?? 'ungraded', simulated: out, where: h.where, notes: h.notes ?? h.note }, { flow_gpm: hasFlow ? h.flow_gpm : 'unknown', source: a.id.includes('HYD') || !h.facility_id ? 'sources/fill-route-hydrants' : 'sites/silver-hill' }, [...provenance, 'Flow-test age is calculated from the test date, not the service date. Stored stale flags are shown without inventing an age policy.', h.provenance ?? d.site.provenance, ...(out ? [d.scenario.out_of_service_reason] : [])]);
  }
  if (name === 'shuttle_plan') {
    if (!d.shuttle.fill_hydrant) return missing('Routed shuttle inputs missing', provenance);
    const facts = shuttleFacts(d, a.tankers, gpm);
    return known(facts, { source:'settings/shuttle_timing + routes/shuttle-loop + settings/mutual_aid', timing:d.settings.shuttle_timing },
      [...provenance, 'Capacities are SYNTHETIC unless marked edited. Nurse units do not shuttle.',
       'Effective fill rate is the lower of tested hydrant flow and the configured apparatus fill rate.',
       'Outbound and return must be separately routed; missing legs prevent a cycle or tanker-count verdict.',
       facts.queue]);
  }
  if (name === 'mutual_aid_bearings') {
    const aid = d.settings.mutual_aid;
    if (!Array.isArray(aid?.departments)) return missing('Mutual aid station records missing', provenance);
    return known({ departments: aid.departments.map((dept: Document) => ({ ...dept, staging: a.selected_option ? `Officer selected ${a.selected_option}: arrive from ${dept.arrives_from_compass ?? 'unknown'}; staging location requires officer confirmation` : 'No option selected; staging not committed' })), selected_option: a.selected_option ?? 'not selected' }, { source: 'settings/mutual_aid', bearing_method: 'stored geocoded station-to-incident bearings' }, [...provenance, aid.provenance, aid.staging_rule, 'Bearings are approach sectors, not a verified road route or an apparatus dispatch.']);
  }
  return missing('Unknown tool');
}
export async function runTool(name: ToolName, input: Record<string, unknown>, snapshot: Snapshot): Promise<ToolCall> {
  const start = performance.now();
  let output: ToolOutput;
  try { output = evaluateTool(name, input, snapshot); } catch { output = missing('Stored inputs are incomplete or malformed'); }
  return { name, input, output, ms: round(performance.now() - start) };
}
export const descriptions: Record<ToolName,string> = {
 hydrant_side_of_road:'Compute a hydrant side and nearest offset from its coordinates and a directed stored route polyline.',
 route_overlap:'Compute the fraction of route A vertices lying within a supplied meter tolerance of route B. Requires both polylines.',
 staging_candidates:'Read the proposed staging point, both precomputed overlap legs, lane blocking and parking-lot limitations.',
 measure_lay:'Read the measured distance from a hydrant ID or driveway to the active incident, sections, and unknown road-crossing geometry.',
 water_demand:'Compute attack demand and tank duration. Omit line_ids for the stored attack assignment; repeat a preset ID to add another line. Returns available line IDs.',
 friction_loss:'Compute friction from department coefficients. Discharge and margin require explicit elevation and appliance losses; never invent those.',
 segment_plan:'Compute relay layout and hose shortfall from policy and supplied distance; pressure feasibility needs explicit losses.',
 source_feasibility:'Check a stored source against demand, including red tags, simulated status, flow-test age and missing tests.',
 shuttle_plan:'Calculate routed tanker cycles and fleet requirement, including fill bottleneck, synthetic capacities and unmodelled queueing. Nurses are excluded.',
 mutual_aid_bearings:'Return stored arrival sectors and staging guidance for the officer-selected supply option. Does not dispatch or commit apparatus.',
};
export const toolDefinitions = Object.entries(schemas).map(([name,schema]) => ({ type:'function' as const, function:{ name, description:descriptions[name as ToolName], parameters:z.toJSONSchema(schema), strict:false } }));
