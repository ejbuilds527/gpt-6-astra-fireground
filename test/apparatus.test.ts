import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hoseInventory} from '../lib/apparatus';
import type {Snapshot} from '../lib/data';
const fixture=()=>({settings:{policy:{hose_section_ft:100},apparatus:{units:[
 {id:'first',label:'First',role:'attack',hose_5in_ft:1500,staffed_first_alarm:true},
 {id:'supply',label:'Supply',role:'supply',hose_5in_ft:2500,staffed_first_alarm:true},
 {id:'later',label:'Later',role:'engine',hose_5in_ft:null,staffed_first_alarm:false},
 {id:'nurse',label:'Nurse',role:'nurse',hose_5in_ft:9000,staffed_first_alarm:true},
]}},relay:{road_distance_ft:4754}} as unknown as Snapshot);
test('editing carried hose changes first-alarm verdict without stored totals',()=>{
 const d=fixture();
 assert.equal(hoseInventory(d).first_alarm.verdict,'SHORT');
 assert.equal(hoseInventory(d).first_alarm.short_by_ft,800);
 d.settings.apparatus.units[0].hose_5in_ft=2500;
 assert.equal(hoseInventory(d).first_alarm.verdict,'AVAILABLE');
 assert.equal(hoseInventory(d).all.known_ft,5000);
 assert.equal(hoseInventory(d).all.is_floor,true);
});
test('unknown hose and unknown staffing do not become zero or an available verdict',()=>{
 const d=fixture();d.settings.apparatus.units[0].hose_5in_ft=null;
 assert.equal(hoseInventory(d).first_alarm.verdict,'UNGRADED');
 assert.equal(hoseInventory(d).first_alarm.is_floor,true);
 d.settings.apparatus.units[0].hose_5in_ft=9999;delete d.settings.apparatus.units[0].staffed_first_alarm;
 assert.equal(hoseInventory(d).first_alarm.verdict,'UNGRADED');
});
