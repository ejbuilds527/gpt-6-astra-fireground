import test from 'node:test';
import assert from 'node:assert/strict';
import { groundProposal, groundChallenges, checkProposal, decide, pickNames, NEEDS_MEASUREMENT, type StageEvent } from '../lib/decide';
import type { FactPack } from '../lib/facts';
const facts: FactPack = Object.fromEntries(Object.entries({ 'F.DEM.gpm': 680, 'F.HYD.1-18.gpm': 1000, 'F.RT.dump.cycle_min': 8.4, 'F.APP.hose_first_alarm_ft': 4000, 'F.RT.relay.hose_needed_ft': 4800 }).map(([id, value]) => [id, { id, value, unit: '', source: 'fixture measurement' }]));
function proposal() {
  return { ...Object.fromEntries(pickNames.map(name => [name, { pick: name === 'fill_site' ? 'Hydrant 1-18' : name === 'supply_mode' ? 'relay' : 'RIGHT', why: 'PRIVATE_PROPOSER_REASONING', grounded_in: ['F.DEM.gpm'] }])), engine_assignments: [], unreadable: [] };
}
const challenge = { target: 'fill_site.pick', severity: 'BLOCK', claim: 'Stale measurement', grounded_in: ['F.HYD.1-18.gpm'], test: 'flow test', would_have_picked: 'verify first' };
test('reject every pick with empty, unknown, mixed, or inherited grounding', () => {
  for (const name of pickNames) for (const ids of [[], ['F.invented'], ['F.DEM.gpm', 'F.invented'], ['toString']]) {
    const raw = proposal() as any; raw[name].grounded_in = ids;
    const actual = groundProposal(raw, facts)[name];
    assert.equal(actual.status, 'REJECTED'); assert.equal(actual.pick, NEEDS_MEASUREMENT);
    assert.ok(!JSON.stringify(actual).includes('PRIVATE_PROPOSER_REASONING'));
  }
});
test('empty and null picks become an explicit measurement request', () => {
  for (const pick of ['', '   ', null]) {
    const raw = proposal() as any; raw.dump_site.pick = pick;
    assert.equal(groundProposal(raw, facts).dump_site.pick, NEEDS_MEASUREMENT);
  }
});
test('strict proposal parser rejects extra free text', () => {
  assert.throws(() => groundProposal({ ...proposal(), explanation: 'extra' }, facts));
});
test('discard ungrounded challenges and preserve open BLOCK with normalized target', () => {
  const result = groundChallenges({ challenges: [challenge, { ...challenge, grounded_in: [] }, { ...challenge, grounded_in: ['F.fake'] }] }, facts);
  assert.equal(result.length, 1); assert.equal(result[0].open, true); assert.equal(result[0].target, 'fill_site');
});
test('checks retain blocked hose option and never grade absent measurements green', () => {
  const p = groundProposal(proposal(), facts); const checks = checkProposal(p, facts);
  assert.ok(checks.some(c => c.severity === 'BLOCK' && c.why.includes('800 ft')));
  assert.ok(checks.some(c => c.target === 'dump_site' && c.severity === 'UNGRADED'));
  assert.ok(!checks.some(c => c.target === 'fill_site')); assert.equal(p.supply_mode.pick, 'relay');
});
test('five stages stream in order, review has clean context, proposal only appears after review', async () => {
  const events: StageEvent[] = []; const models: string[] = [];
  const result = await decide({ assemble: async () => facts, emit: e => events.push(e), call: async (model, system, user) => {
    models.push(model);
    if (models.length === 1) return JSON.stringify(proposal());
    assert.deepEqual(events.map(e => e.stage), ['ASSEMBLE', 'PROPOSE', 'CHECK']);
    assert.ok(!user.includes('PRIVATE_PROPOSER_REASONING'));
    assert.ok(!system.includes('You are the water supply advisor'));
    assert.ok(!JSON.stringify(events).includes('PRIVATE_PROPOSER_REASONING'));
    return JSON.stringify({ challenges: [challenge] });
  } });
  assert.deepEqual(models, ['gpt-6-astra', 'gpt-5.6-sol']);
  assert.deepEqual(events.map(e => e.stage), ['ASSEMBLE', 'PROPOSE', 'CHECK', 'CHALLENGE', 'PRESENT']);
  assert.equal(result.status.fill_site, 'BLOCK'); assert.equal(result.challenges[0].open, true);
});
test('failed reviewer never presents an unchallenged proposal', async () => {
  const events: StageEvent[] = [];
  await assert.rejects(decide({ assemble: async () => facts, emit: e => events.push(e), call: async model => {
    if (model === 'gpt-6-astra') return JSON.stringify(proposal());
    throw new Error('reviewer unavailable');
  } }));
  assert.ok(!events.some(e => e.stage === 'PRESENT'));
});

test('fact assembly preserves the Python drive endpoints and rejects missing records', async () => {
  const { assembleFacts } = await import('../lib/facts');
  const docs: Record<string, any> = {
    'sites/silver-hill': { address: 'site' },
    'scenarios/lodge-confirmed': { building: 'Lodge', driveway_ft: 1000, hydrant_ranking: [] },
    'settings/apparatus': { units: [{ id: 'E7' }] },
    'settings/attack_scenario': { demand_gpm: 680, tank_seconds: 66 },
    'routes/dump-site': { supply_line_ft: 1000, cycle_min: 8.4, tankers_required: 3, delivered_gpm: 889 },
    'sources/hydrant_side_of_road': { hydrants: [] },
    'settings/policy': {}, 'settings/supply_modes': { modes: [{ id: 'shuttle_dump' }] },
  };
  const pack = await assembleFacts(async path => docs[path]);
  const drive = pack['F.SITE.drive_polyline'].value as number[][];
  assert.equal(drive.length, 28);
  assert.deepEqual(pack['F.SITE.drive_entry'].value, drive[0]);
  assert.deepEqual(pack['F.SITE.drive_end'].value, drive.at(-1));
  assert.equal(pack['F.APP.E7.hose_5in_ft'].value, null);
  assert.equal(pack['F.TANKER.capacity_source'].value, 'SYNTHETIC');
  for (const [id, fact] of Object.entries(pack)) { assert.equal(fact.id, id); assert.notEqual(fact.value, undefined); }
  delete docs['routes/dump-site'].cycle_min;
  await assert.rejects(assembleFacts(async path => docs[path]), /Missing fact value/);
});

test('deterministic gate blocks crossings, low flow, overlapping staging, undersized tanks and unrouted count', () => {
  const pack = structuredClone(facts);
  const set = (id: string, value: unknown) => { pack[id] = { id, value, unit: '', source: 'measured fixture' }; };
  set('F.HYD.1-18.gpm', 100); set('F.RT.lay.crosses_road', true);
  set('F.STG.RIGHT.overlap_pct', 45); set('F.TANK.portable_gal', 3000); set('F.TANKER.capacity_gal', 2500);
  delete pack['F.RT.dump.cycle_min'];
  const raw = proposal() as any; raw.supply_mode.pick = 'shuttle_dump';
  const checks = checkProposal(groundProposal(raw, pack), pack);
  for (const fragment of ['less than demand', 'crosses a road', 'overlaps', '1.4 times', 'no routed cycle']) {
    assert.ok(checks.some(c => c.severity === 'BLOCK' && c.why.includes(fragment)), fragment);
  }
  raw.supply_mode.pick = 'draft';
  assert.ok(checkProposal(groundProposal(raw, pack), pack).some(c => c.severity === 'UNGRADED' && c.why.includes('Static lift')));
});
