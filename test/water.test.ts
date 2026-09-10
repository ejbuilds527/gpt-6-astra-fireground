import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frictionLoss, demand, tankSeconds, shuttleCycle, maxSegment, segmentCount, tankersRequired, requiredDischarge, margin } from '../lib/water';
const policy = {receiving_intake_target_psi:20,hose_max_operating_psi:180,department_discharge_cap_psi:180,safety_margin_psi:40,recommended_segment_ft:1500,hose_section_ft:100};
test('fixture: documented attack, friction and relay hose inventory', () => {
 assert.equal(demand([180,500]).value,680);
 assert.equal(Math.floor(tankSeconds(750,680).value as number),66);
 assert.ok(Math.abs((frictionLoss(.08,680,100).value as number)-3.6992)<1e-8);
 assert.equal(maxSegment(.08,680,policy,0,0).value,3200);
 assert.deepEqual(segmentCount(4754,1500,100).value,{segments:4,intermediate_relays:3,sections:48,hose_ft:4800});
 assert.equal(requiredDischarge(100,20,10,5).value,135);
 assert.equal(margin(135,180,160).value,25);
});
test('routed cycle uses full precision and counts round up', () => {
 const cycle=shuttleCycle(3000,855.87,6,3,2);
 assert.notEqual(cycle.value,'unknown');
 if(cycle.value!=='unknown') assert.equal(tankersRequired(680,cycle.value.delivered_gpm).value,4);
});
test('missing, invalid and zero capacity never become optimistic results', () => {
 for(const r of [demand([]),demand([NaN]),tankSeconds(0,680),shuttleCycle(3000,0,6,3,2),shuttleCycle(3000,855,NaN,3,2),frictionLoss(NaN,680,100),segmentCount(100,50,100),maxSegment(.08,680,{...policy,safety_margin_psi:200},0,0)]) assert.equal(r.value,'unknown');
});
