import { db, type Document } from './data';

export type Fact = { id: string; value: unknown; unit: string; source: string };
export type FactPack = Record<string, Fact>;
export type ReadDocument = (path: string) => Promise<Document>;
// Captured Google Directions geometry used by tools/astra-loop.py, not inferred by a model.
const DRIVE = [[41.16412, -73.46857], [41.16399, -73.46817], [41.16399, -73.46784], [41.16405, -73.4676], [41.16416, -73.4674], [41.16425, -73.46734], [41.16428, -73.46732], [41.16435, -73.46733], [41.16444, -73.46735], [41.16449, -73.46734], [41.16457, -73.46726], [41.16465, -73.46717], [41.16502, -73.46696], [41.16506, -73.46695], [41.16508, -73.46697], [41.16509, -73.46693], [41.16513, -73.46685], [41.16519, -73.46676], [41.16532, -73.46664], [41.16543, -73.46656], [41.16557, -73.46652], [41.16571, -73.46651], [41.16585, -73.46654], [41.166, -73.46656], [41.16618, -73.46652], [41.16636, -73.46655], [41.16659, -73.46668], [41.16668, -73.46678]];

export async function assembleFacts(read: ReadDocument = async path => {
  const snapshot = await db.doc(path).get();
  if (!snapshot.exists) throw new Error(`Missing fact document: ${path}`);
  return snapshot.data()!;
}): Promise<FactPack> {
  const [site, scen, app, att, dump, hsr, pol, modes] = await Promise.all([
    'sites/silver-hill', 'scenarios/lodge-confirmed', 'settings/apparatus',
    'settings/attack_scenario', 'routes/dump-site', 'sources/hydrant_side_of_road',
    'settings/policy', 'settings/supply_modes',
  ].map(read));
  const facts: FactPack = {};
  const F = (id: string, value: unknown, unit: string, source: string) => {
    if (value === undefined) throw new Error(`Missing fact value: ${id}`);
    facts[id] = { id, value, unit, source };
  };
  F("F.SITE.address", site["address"], "", "department record");
  F("F.SITE.building", scen["building"], "", "placed by the IC on arrival");
  F("F.SITE.driveway_ft", scen["driveway_ft"], "ft", "measured along the drive");
  F("F.SITE.drive_single_track", true, "", "department statement");
  F("F.DEM.gpm", att["demand_gpm"], "gpm", "1 3/4 smoothbore 180 + 2 1/2 BlitzFire 500");
  F("F.DEM.tank_seconds", att["tank_seconds"], "s", "750 gal E7 tank at demand");
  for (const h of scen["hydrant_ranking"]) {
  F("F.HYD." + h["id"] + ".ft", h["ft"], "ft", "department record, from the Lodge");
  if ((h["status"] ?? null)) {
  F("F.HYD." + h["id"] + ".status", h["status"], "", "department record");
  }
  if ((h["gpm"] ?? null)) {
  F("F.HYD." + h["id"] + ".gpm", h["gpm"], "gpm", "NFPA 291 flow test");
  }
  if ((h["note"] ?? null)) {
  F("F.HYD." + h["id"] + ".note", h["note"], "", "department record");
  }
  }
  for (const h of hsr["hydrants"]) {
  F("F.HYD." + h["id"] + ".side", h["side"], "", "computed: cross product against the routed polyline");
  if ((h["gpm"] ?? null)) {
  F("F.HYD." + h["id"] + ".gpm", h["gpm"], "gpm", "NFPA 291 flow test");
  }
  }
  F("F.HYD.1-18.flow_test_days", 696, "days", "last tested 2024-10-14");
  for (const u of app["units"]) {
  F("F.APP." + u["id"] + ".hose_5in_ft", (u["hose_5in_ft"] ?? null), "ft", "department, corrected 2026-09-10");
  F("F.APP." + u["id"] + ".tank_gal", (u["tank_gal"] ?? null), "gal", "department");
  F("F.APP." + u["id"] + ".pump_gpm", (u["pump_gpm"] ?? null), "gpm", "NFPA 1900 rated");
  }
  F("F.APP.first_alarm_rigs", 2, "rigs", "six career staff put two rigs on the road");
  F("F.APP.hose_first_alarm_ft", 4000, "ft", "E7 1500 + E2 2500");
  F("F.RT.dump.supply_ft", dump["supply_line_ft"], "ft", "Google Directions, dump site to the fire");
  F("F.RT.dump.cycle_min", dump["cycle_min"], "min", "routed legs + fill + dump + manoeuvre");
  F("F.RT.dump.tankers", dump["tankers_required"], "tankers", "delivered gpm vs demand");
  F("F.RT.dump.delivered_gpm", dump["delivered_gpm"], "gpm", "2500 gal / cycle x tankers");
  F("F.RT.relay.pull_ft", 4754, "ft", "Google Directions, hydrant 1-18 to the site");
  F("F.RT.relay.hose_needed_ft", 4800, "ft", "pull rounded up to a whole hose section");
  F("F.POL.intake_psi", (pol["intake_psi"] ?? 20), "psi", "department policy");
  F("F.POL.hose_max_psi", (pol["hose_max_psi"] ?? 180), "psi", "NFPA 1962 marked max");
  F("F.MODE.options", modes["modes"].map((m: Document) => m["id"]), "", "settings/supply_modes");
  F("F.TANKER.capacity_source", "SYNTHETIC", "", "2500 gal assumed for every mutual aid tanker");
  F("F.SITE.drive_polyline", DRIVE, "lat,lon pairs", "Google Directions, Valley Rd drop to the Lodge, 28 vertices. THIS IS THE LINE LEFT AND RIGHT ARE DEFINED AGAINST.");
  F("F.SITE.drive_direction", "entry at the Valley Rd drop -> the Lodge", "", "left and right are taken looking along this direction");
  F("F.SITE.drive_entry", DRIVE[0], "lat,lon", "the public-road end, where E7 drops");
  F("F.SITE.drive_end", DRIVE[DRIVE.length - 1], "lat,lon", "the Lodge end, where E7 parks and pumps");
  F("F.SITE.drive_obstructions", {"left": ["dry stone wall from 180 ft to 430 ft from the entry, hard against the edge", "drainage swale from 500 ft to 620 ft, soft ground"], "right": ["mature trees set back 6 ft, trunks clear of the shoulder", "gravel turnout at 610 ft, firm"]}, "", "DEPARTMENT WALK-THROUGH, entered on the settings page. Recorded looking entry -> Lodge.");
  F("F.SITE.drive_shoulder_width", {"left": 2.0, "right": 5.0}, "ft", "DEPARTMENT WALK-THROUGH, narrowest clear width on each side, entered on the settings page.");
  F("F.SITE.drive_entry_side_of_building", "the Lodge front entry and the pump panel face the RIGHT side looking entry -> Lodge", "", "department walk-through");
  F("F.OPS.hose_od_charged", 5.0, "in", "5 in LDH, charged outside diameter");
  F("F.OPS.lane_width_typical", 12, "ft", "a single-track drive lane");
  return facts;
}
