import { db, readSnapshot, type Document, type Snapshot } from './data';
import { runTool } from './tools';
import { attackSnapshot } from './attack';
import { hoseInventory } from './apparatus';
import type { Role } from './roles';

export const incidentRef = () => db.doc('incidents/training');
export const initialIncident = { scenario_id: 'general-alarm', selected_option: null, tone_at: null, hold_south: true, shuttle_assigned: false, line_ids: null, states: {} };
export async function incidentView(role: Role, state: Document, identity: Document = {}) {
  const start = performance.now();
  const d = attackSnapshot(await readSnapshot(state.scenario_id || 'general-alarm'),state.line_ids);
  const readMs = performance.now() - start;
  const base = { scenario: { id: d.scenarioId, label: d.scenario.label, dispatch: d.scenario.dispatch_text, confidence: d.scenario.location_confidence },
    mode: d.settings.policy?.mode || 'TRAINING', disclaimer: d.settings.policy?.disclaimer,
    tone_at: state.tone_at, selected_option: state.selected_option, updated_at: state.updated_at,
    states: state.states || {}, hold_south: state.hold_south, shuttle_assigned: state.shuttle_assigned };
  const staging = { states: d.settings.staging?.states || [], principle: d.settings.staging?.principle,
    split: d.settings.staging_gap?.split || {south:(d.settings.mutual_aid?.departments||[]).filter((x:Document)=>x.state!=='HOME'&&String(x.arrives_from_compass).includes('S')).map((x:Document)=>x.department+' '+x.arrives_from_compass+' '+x.straight_mi+' mi')}, point:d.settings.staging_gap?.chosen||null, point_reason:d.settings.staging_gap?.what_that_means||d.settings.staging_gap?.not_chosen, overlap:d.settings.staging_gap?.measured_overlap||null, confirmed:state.staging_confirmed||false,
    departments: (d.settings.mutual_aid?.departments || []).filter((x: Document) => x.state !== 'HOME')
      .map((x: Document) => ({ code: x.code, department: x.department, bearing: x.arrives_from_compass, distance: x.straight_mi })) };
  if (role === 'staging') return { ...base, staging };
  if(role === 'relay') {
    const assignment=d.settings.relay_assignments || {};
    const position=assignment.positions?.find((p:Document)=>p.n===Number(identity.relayPosition));
    const demand=await runTool('water_demand',{},d);
    const relay=await runTool('segment_plan',{distance_ft:d.relay.road_distance_ft,hose:'5_inch'},d);
    return {...base, relay:{position:position||null, upstream:assignment.positions?.find((p:Document)=>p.n===Number(identity.relayPosition)-1)||null,
      downstream:assignment.positions?.find((p:Document)=>p.n===Number(identity.relayPosition)+1)||null,
      intake_psi:d.settings.policy?.receiving_intake_target_psi, discharge:'UNKNOWN — segment elevation and appliance losses not measured',
      limitation:assignment.not_modelled, plan:relay, demand}};
  }
  const shuttle = await runTool('shuttle_plan', {}, d);
  if (role === 'tanker') {
    const v=shuttle.output.value;
    return {...base,tanker:{position:identity.shuttlePosition,fill_hydrant:v.fill_hydrant,side:v.side,direction:v.side_direction,
      finding:v.side_finding,next_move:'Confirm next move with shuttle command; live vehicle position is not modelled.'}};
  }
  if (role === 'shuttle') return { ...base, shuttle, states_available: d.settings.staging?.states || [], timing: d.settings.shuttle_timing };
  const demand = await runTool('water_demand', {}, d);
  const ranked = [...(d.scenario.hydrant_ranking || [])].sort((a: Document,b: Document) => a.ft-b.ft);
  const hydrants = await Promise.all(ranked.map(async (h: Document) => ({
    id: h.id, distance_ft: h.ft,
    measure: await runTool('measure_lay', {from: h.id}, d),
    source: await runTool('source_feasibility', {id: h.id}, d),
  })));
  const relay = await runTool('segment_plan', {distance_ft: d.relay.road_distance_ft, hose:'5_inch'}, d);
  const stages = (d.settings.turnout?.stages || []).map((s: Document) => {
    const measured = s.n === 2 ? readMs : s.n === 3 ? hydrants.reduce((n:number,h:Document)=>n+h.measure.ms+h.source.ms,0)
      : s.n === 4 ? demand.ms : s.n === 6 ? relay.ms+shuttle.ms : null;
    return { ...s, measured_ms: measured, status: measured === null ? 'not run' : 'done',
      precomputed: s.n === 2 || s.n === 3 };
  });
  return { ...base, demand, hydrants, relay, shuttle, inventory: hoseInventory(d), staging, stages,
    window_seconds: d.settings.turnout?.window_seconds, model_status: 'Not run — geometry and imagery interpretation are ungraded.',
    attack_lines:d.settings.attack_lines?.lines||[], line_ids:state.line_ids??d.settings.attack_lines?.lines?.filter((l:Document)=>l.default_on).map((l:Document)=>l.id)??[],
    settings: editableSettings(d) };
}
export function editableSettings(d: Snapshot) {
  const a = d.settings.apparatus || {};
  return {
    apparatus: { revision:a.revision || 0, units: (a.units || []).map((u: Document) => ({
      id:u.id, label:u.label, pump_gpm:u.pump_gpm ?? null, tank_gal:u.tank_gal ?? null,
      hose_5in_ft:u.hose_5in_ft ?? null, role:u.role, staffed_first_alarm:u.staffed_first_alarm ?? null,
      provenance:u.provenance || (a.synthetic ? 'SYNTHETIC' : a.source || 'NO NFPA SOURCE'),
    })), source:a.source || 'NO NFPA SOURCE' },
    friction: { revision:d.settings.friction_coefficients?.revision || 0, five_inch: d.settings.friction_coefficients?.single_line?.['5_inch'] ?? null,
      source: d.settings.friction_coefficients?.source || 'NO NFPA SOURCE' },
    timing: d.settings.shuttle_timing,
  };
}
