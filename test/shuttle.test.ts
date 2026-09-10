import {test} from 'node:test';import assert from 'node:assert/strict';
import {shuttleFacts} from '../lib/shuttle';import type {Snapshot} from '../lib/data';
function fixture(){return {settings:{shuttle_timing:{fill_rate_gpm:1000,dump_rate_gpm:1500,manoeuvre_fill_site_s:60,manoeuvre_dump_site_s:60},mutual_aid:{departments:[{department:'Test',state:'CT',tanker_gallons:3000}]},apparatus:{units:[{label:'Nurse',role:'nurse'}]}},sources:{hydrants:[{id:'fill',flow_gpm:750}]},shuttle:{fill_hydrant:'fill',assignment:['Test'],outbound:{duration_seconds:180},return:{duration_seconds:240}}} as unknown as Snapshot;}
test('cycle uses distinct route legs and the lower fill rate',()=>{
 const d=fixture();const r=shuttleFacts(d,undefined,200);
 assert.equal(r.effective_fill_gpm,750);
 assert.equal(r.tankers[0].fill_min,4);
 assert.equal(r.tankers[0].cycle_min,15);
 assert.equal(r.sustained_gpm,200);
 assert.equal(r.tankers_required,1);
 assert.deepEqual(r.nurse,['Nurse']);
});
test('aggregate travel is never silently split into two measured legs',()=>{
 const d=fixture();delete d.shuttle.return;d.shuttle.drive_minutes=7;
 const r=shuttleFacts(d,undefined,200);
 assert.equal(r.verdict,'ungraded');
 assert.equal(r.tankers[0].cycle_min,null);
 assert.equal(r.tankers_required,'unknown');
});
