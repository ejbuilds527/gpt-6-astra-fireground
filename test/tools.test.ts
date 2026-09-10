import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTool } from '../lib/tools';
import type { Snapshot } from '../lib/data';
const fixture:Snapshot={scenarioId:'lodge-confirmed',settings:{policy:{hose_section_ft:100,receiving_intake_target_psi:20,hose_max_operating_psi:180,department_discharge_cap_psi:180,safety_margin_psi:40,recommended_segment_ft:1500},attack_scenario:{lines:[{gpm:180,name:'handline'},{gpm:500,name:'monitor'}],tank_gallons:750},attack_lines:{presets:[{id:'handline',gpm:180},{id:'monitor',gpm:500}]},friction_coefficients:{single_line:{'5_inch':.08}},apparatus:{units:[{id:'fixture-engine',label:'Fixture engine',role:'engine',hose_5in_ft:2000,staffed_first_alarm:true}]}},site:{hydrants:[{facility_id:'tagged',flow_gpm:608,last_flow_test:'2026-03-20'},{facility_id:'untested',flow_gpm:null},{facility_id:'short',flow_gpm:665,last_flow_test:'2025-11-17'}]},sources:{hydrants:[]},scenario:{hydrant_status:{tagged:'OUT_OF_SERVICE'},out_of_service_reason:'SIMULATED',hydrant_ranking:[{id:'tagged',ft:148}]},relay:{coefficient:.08,road_distance_ft:4754},shuttle:{}};
test('red tag remains present and untested capacity is unknown',()=>{
 assert.equal(evaluateTool('source_feasibility',{id:'tagged'},fixture).value.verdict,'RED-TAGGED');
 assert.equal(evaluateTool('source_feasibility',{id:'untested'},fixture).value.gpm.value,'unknown');
 assert.equal(evaluateTool('source_feasibility',{id:'short'},fixture).value.margin_gpm,-15);
});
test('adding a duplicate handline recomputes downstream demand',()=>{
 const d=evaluateTool('water_demand',{line_ids:['handline','monitor','handline']},fixture);
 assert.equal(d.value.gpm,860);
 assert.equal(evaluateTool('source_feasibility',{id:'short',demand:d.value.gpm},fixture).value.margin_gpm,-195);
});
test('settings changes affect calculations; geometry and missing losses stay ungraded',()=>{
 const changed=structuredClone(fixture);changed.settings.friction_coefficients.single_line['5_inch']=.16;
 assert.equal(evaluateTool('friction_loss',{hose:'5_inch',gpm:680,length:100},changed).value.total,7.4);
 assert.equal(evaluateTool('friction_loss',{hose:'5_inch',gpm:680,length:100},fixture).value.discharge.value,'unknown');
 assert.equal(evaluateTool('measure_lay',{from:'tagged'},fixture).value.crosses_road.value,'unknown');
 assert.equal(evaluateTool('segment_plan',{distance_ft:4754},fixture).value.hose_shortfall_ft,2800);
 assert.equal(evaluateTool('shuttle_plan',{},fixture).value,'unknown');
});
