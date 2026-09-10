import { db, type Document } from './data';
import { points, nearestSegment } from './geometry';

export type Fact = { id: string; value: unknown; unit: string; source: string };
export type FactPack = Record<string, Fact>;
export type ReadDocument = (path: string) => Promise<Document>;
// Captured Google Directions geometry used by tools/astra-loop.py, not inferred by a model.
const DRIVE = [[41.16412, -73.46857], [41.16399, -73.46817], [41.16399, -73.46784], [41.16405, -73.4676], [41.16416, -73.4674], [41.16425, -73.46734], [41.16428, -73.46732], [41.16435, -73.46733], [41.16444, -73.46735], [41.16449, -73.46734], [41.16457, -73.46726], [41.16465, -73.46717], [41.16502, -73.46696], [41.16506, -73.46695], [41.16508, -73.46697], [41.16509, -73.46693], [41.16513, -73.46685], [41.16519, -73.46676], [41.16532, -73.46664], [41.16543, -73.46656], [41.16557, -73.46652], [41.16571, -73.46651], [41.16585, -73.46654], [41.166, -73.46656], [41.16618, -73.46652], [41.16636, -73.46655], [41.16659, -73.46668], [41.16668, -73.46678]];

// Captured Google Directions geometry for Valley Rd, ordered the drive entry -> the dump site.
// Ported from docs/design/street-poly.json; a routed centreline, never a survey.
const STREET = [[41.16468, -73.46724], [41.16455, -73.46696], [41.16438, -73.46667], [41.16412, -73.46634], [41.16398, -73.46619], [41.16381, -73.46609], [41.16374, -73.46605], [41.16347, -73.46593], [41.16295, -73.46569], [41.16251, -73.46551], [41.16228, -73.46537], [41.16214, -73.46527], [41.16146, -73.46473], [41.16084, -73.46423], [41.16056, -73.46396]];
const readDocument: ReadDocument = async path => {
  const snapshot = await db.doc(path).get();
  if (!snapshot.exists) throw new Error(`Missing fact document: ${path}`);
  return snapshot.data()!;
};
// settings/adversarial_rubric holds what the clean-context reviewer tests. It is the REVIEWER's
// rubric, so it reaches stage 4 as instructions and never enters the proposer's fact pack.
export async function assembleAdversarialRubric(read: ReadDocument = readDocument): Promise<string[]> {
  const doc = await read('settings/adversarial_rubric').catch(() => ({} as Document));
  return Object.entries(doc ?? {})
    .filter(([key, text]) => /^C\d+_/.test(key) && typeof text === 'string')
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([key, text]) => `${key}: ${text}`);
}

export async function assembleFacts(read: ReadDocument = readDocument): Promise<FactPack> {
  const [site, scen, app, att, dump, hsr, pol, modes, relay = {}, staging = {}, sources = {}, lines = {}, lay = {}] = await Promise.all([
    'sites/silver-hill', 'scenarios/lodge-confirmed', 'settings/apparatus',
    'settings/attack_scenario', 'routes/dump-site', 'sources/hydrant_side_of_road',
    'settings/policy', 'settings/supply_modes', 'routes/relay-pull', 'settings/staging_gap',
    'sources/fill-route-hydrants', 'settings/attack_lines', 'settings/lay_assignments',
  ].map(read));
  const layRubric = await read('settings/lay_rubric').catch(() => ({} as Document)) ?? {};
  const facts: FactPack = {};
  const F = (id: string, value: unknown, unit: string, source: string) => {
    if (value === undefined) throw new Error(`Missing fact value: ${id}`);
    facts[id] = { id, value, unit, source };
  };
  F("F.SITE.address", site["address"], "", "department record");
  F("F.SITE.building", scen["building"], "", "placed by the IC on arrival");
  F("F.SITE.driveway_ft", scen["driveway_ft"], "ft", "measured along the drive");
  F("F.SITE.drive_single_track", scen.drive_single_track ?? null, "", "scenarios/lodge-confirmed.drive_single_track; null means not recorded");
  const selected = Array.isArray(lines.lines) ? lines.lines.filter((l: Document) => l.default_on) : null;
  const demand = selected ? selected.every((l: Document) => typeof l.gpm === 'number' && l.gpm >= 0) ? selected.reduce((n: number, l: Document) => n + l.gpm, 0) : null : att.demand_gpm;
  const attackTank = app.units.find((u: Document) => u.role === 'attack')?.tank_gal;
  F("F.DEM.gpm", demand, "gpm", "code: sum default-on settings/attack_lines; legacy settings/attack_scenario when line inputs absent");
  F("F.DEM.tank_seconds", selected ? demand > 0 && typeof attackTank === 'number' ? Math.floor(attackTank / demand * 60) : null : att.tank_seconds, "s", "code: settings/apparatus attack tank / demand * 60");
  for (const h of scen["hydrant_ranking"]) {
  F("F.HYD." + h["id"] + ".ft", h["ft"], "ft", "department record, from the Lodge");
  if ((h["status"] ?? null)) {
  F("F.HYD." + h["id"] + ".status", h["status"], "", "department record");
  }
  if (h["gpm"] !== undefined && h["gpm"] !== null) {
  F("F.HYD." + h["id"] + ".gpm", h["gpm"], "gpm", "NFPA 291 flow test");
  }
  if ((h["note"] ?? null)) {
  F("F.HYD." + h["id"] + ".note", h["note"], "", "department record");
  }
  }
  for (const h of hsr["hydrants"]) {
  F("F.HYD." + h["id"] + ".side", h["side"], "", "computed: cross product against the routed polyline");
  if (h["gpm"] !== undefined && h["gpm"] !== null) {
  F("F.HYD." + h["id"] + ".gpm", h["gpm"], "gpm", "NFPA 291 flow test");
  }
  }
for (const h of [...(site.hydrants || []), ...(sources.hydrants || [])]) {
    const id = h.id || h.facility_id;
    if (!id) continue;
    F(`F.HYD.${id}.gpm`, h.flow_gpm ?? null, 'gpm', `Firestore flow test: ${id}`);
    if (h.last_flow_test) {
      const tested = Date.parse(h.last_flow_test);
      F(`F.HYD.${id}.flow_test_days`, Number.isFinite(tested) ? Math.floor((Date.now() - tested) / 86400000) : null, 'days', `code: current date minus recorded last_flow_test ${h.last_flow_test}`);
    }
  }
  for (const u of app["units"]) {
  F("F.APP." + u["id"] + ".hose_5in_ft", (u["hose_5in_ft"] ?? null), "ft", "department, corrected 2026-09-10");
  F("F.APP." + u["id"] + ".tank_gal", (u["tank_gal"] ?? null), "gal", "department");
  F("F.APP." + u["id"] + ".pump_gpm", (u["pump_gpm"] ?? null), "gpm", "NFPA 1900 rated");
  }
const staffed = app.units.filter((u: Document) => u.staffed_first_alarm === true && !/nurse|tanker/i.test(u.role || ''));
  const staffingKnown = app.units.filter((u: Document) => !/nurse|tanker/i.test(u.role || '')).every((u: Document) => typeof u.staffed_first_alarm === 'boolean');
  F("F.APP.first_alarm_rigs", staffingKnown ? staffed.length : null, 'rigs', 'code: staffed_first_alarm flags in settings/apparatus; unrecorded staffing is unknown');
  F("F.APP.hose_first_alarm_ft", staffingKnown && staffed.every((u: Document) => typeof u.hose_5in_ft === 'number') ? staffed.reduce((n: number, u: Document) => n + u.hose_5in_ft, 0) : null, 'ft', 'code: sum staffed engine hose in settings/apparatus; excludes nurse');
  F("F.RT.dump.supply_ft", dump["supply_line_ft"], "ft", "Google Directions, dump site to the fire");
  F("F.RT.dump.cycle_min", dump["cycle_min"], "min", "routed legs + fill + dump + manoeuvre");
  F("F.RT.dump.tankers", dump["tankers_required"], "tankers", "delivered gpm vs demand");
  F("F.RT.dump.delivered_gpm", dump["delivered_gpm"], "gpm", "2500 gal / cycle x tankers");
  F("F.RT.relay.pull_ft", relay.road_distance_ft ?? null, "ft", "routes/relay-pull.road_distance_ft");
  F("F.RT.relay.hose_needed_ft", typeof relay.road_distance_ft === "number" && pol.hose_section_ft > 0 ? Math.ceil(relay.road_distance_ft / pol.hose_section_ft) * pol.hose_section_ft : null, "ft", "code: routes/relay-pull rounded up to settings/policy.hose_section_ft");
  F("F.POL.intake_psi", (pol.receiving_intake_target_psi ?? pol.intake_psi ?? null), "psi", "department policy");
  F("F.POL.hose_max_psi", (pol.hose_max_operating_psi ?? pol.hose_max_psi ?? null), "psi", "NFPA 1962 marked max");
  F("F.MODE.options", modes["modes"].map((m: Document) => m["id"]), "", "settings/supply_modes");
  F("F.TANKER.capacity_source", "SYNTHETIC", "", "2500 gal assumed for every mutual aid tanker");
  F("F.SITE.drive_polyline", DRIVE, "lat,lon pairs", "Precomputed reference ported from tools/astra-loop.py / docs/design/drive-poly.json; not a live vision result. Entry to Lodge defines left and right.");
  F("F.SITE.drive_direction", "entry at the Valley Rd drop -> the Lodge", "", "left and right are taken looking along this direction");
  F("F.SITE.drive_entry", DRIVE[0], "lat,lon", "the public-road end, where E7 drops");
  F("F.SITE.drive_end", DRIVE[DRIVE.length - 1], "lat,lon", "the Lodge end, where E7 parks and pumps");
  // Do not promote the Python demo's handwritten shoulder dimensions into live measurements.
  // Stored department assignments may be cited as assignments, never as a surveyed shoulder.
  for (const key of ['drive_obstructions', 'drive_shoulder_width', 'drive_entry_side_of_building']) {
    if (scen[key] !== undefined) F('F.SITE.' + key, scen[key], '', 'scenarios/lodge-confirmed.' + key);
  }
  if (lay.assignment_nurse_mode) F('F.OPS.assignments.nurse', lay.assignment_nurse_mode, '', 'settings/lay_assignments.assignment_nurse_mode; recorded assignment, not surveyed geometry');
  if (lay.assignment_relay_mode) F('F.OPS.assignments.relay', lay.assignment_relay_mode, '', 'settings/lay_assignments.assignment_relay_mode; recorded assignment, not surveyed geometry');
  if (staging.chosen) {
    F('F.STG.CT-106.point', staging.chosen, '', 'settings/staging_gap.chosen; PROPOSED');
    F('F.STG.CT-106.overlap_pct', staging.measured_overlap?.mutual_aid_to_staging_pct ?? null, '%', 'settings/staging_gap.measured_overlap; inbound only, tolerance 20 m');
    F('F.RT.stage_to_scene.overlap_pct', staging.measured_overlap?.staging_to_scene_pct ?? null, '%', 'settings/staging_gap.measured_overlap; final approach, tolerance 20 m');
  }
  F('F.RT.dump.where', dump.where ?? null, '', 'routes/dump-site.where');
  F('F.RT.dump.out_min', dump.shuttle_out_min ?? null, 'min', 'routes/dump-site.shuttle_out_min; separately routed');
  F('F.RT.dump.back_min', dump.shuttle_back_min ?? null, 'min', 'routes/dump-site.shuttle_back_min; separately routed');
  F('F.RT.dump.not_surveyed', dump.not_surveyed ?? null, '', 'routes/dump-site.not_surveyed');
  F('F.POL.turnout_seconds', pol.turnout_benchmark_seconds ?? null, 's', 'settings/policy.turnout_benchmark_seconds');
  // The street the drive connects to. R4 and R5 are decided against this line and its direction.
  F('F.SITE.street_polyline', STREET, 'lat,lon pairs', 'Google Directions, Valley Rd from the drive entry to the dump site. THIS IS THE LINE THE STREET LEFT AND RIGHT ARE DEFINED AGAINST.');
  F('F.SITE.street_direction', 'the Valley Rd drop -> the dump site', '', 'left and right on the street are taken looking along this direction');
  const street = points(STREET);
  const side = (label: string, lat: unknown, lon: unknown) => {
    if (street.length < 2 || typeof lat !== 'number' || typeof lon !== 'number') return null;
    const measured = nearestSegment({ lat, lon }, street);
    return `${measured.side} of travel, ${measured.offset_m.toFixed(0)} m off the ${label}`;
  };
  const driveSide = side('Valley Rd centreline', DRIVE[0][0], DRIVE[0][1]);
  F('F.SITE.drive_side_of_street', driveSide ? driveSide.split(' ')[0] : null, '', driveSide
    ? `COMPUTED: cross product of the drive entry against F.SITE.street_polyline, travelling entry -> dump. ${driveSide}. This is the side the driveway connects to.`
    : 'NOT COMPUTED: the drive entry or the street polyline is absent.');
  const dumpSide = side('Valley Rd centreline', dump.lat, dump.lon);
  F('F.RT.dump_side_of_street', dumpSide ? dumpSide.split(' ')[0] : null, '', dumpSide
    ? `COMPUTED: cross product of routes/dump-site lat,lon against F.SITE.street_polyline, travelling entry -> dump. ${dumpSide}.`
    : 'NOT COMPUTED: routes/dump-site carries no lat,lon.');
  F('F.SITE.drive_lay_side_options', ['LEFT', 'RIGHT'], '', 'the two sides of the private drive');
  F('F.RT.street_lay_side_options', ['LEFT', 'RIGHT'], '', 'the two sides of Valley Rd');
  F('F.OPS.hose_od_charged', 5.0, 'in', '5 in LDH, charged outside diameter');
  F('F.OPS.lane_width_typical', 12, 'ft', 'a single-track drive lane');
  // settings/lay_rubric R1-R11 and its precedence. Astra applies them; code supplies the geometry.
  // worked_answer_* is deliberately excluded: handing the proposer the answer tests nothing.
  for (const [key, text] of Object.entries(layRubric)) {
    if (typeof text !== 'string' || !/^(R\d+_|precedence$)/.test(key)) continue;
    F('F.RULE.' + key, text, '', 'settings/lay_rubric.' + key);
  }
  return facts;
}
