import type { Document, Snapshot } from './data';
import { positive, valid } from './water';

export function isSupplyEngine(unit: Document) {
  const role = String(unit.role ?? '').toLowerCase();
  return !/nurse|tanker/.test(role) && /engine|attack|supply/.test(role);
}
export function hoseInventory(d: Snapshot) {
  const units: Document[] = d.settings.apparatus?.units ?? [];
  const engines = units.filter(isSupplyEngine);
  const section = d.settings.policy?.hose_section_ft;
  const distance = d.relay.road_distance_ft;
  const needed = positive(distance) && positive(section) ? Math.ceil(distance / section) * section : null;
  const summarize = (counted: Document[], staffingUnknown = false) => {
    const missing = counted.filter(u => !valid(u.hose_5in_ft)).map(u => u.label || u.id);
    const known = counted.reduce((sum, u) => sum + (valid(u.hose_5in_ft) ? u.hose_5in_ft : 0), 0);
    const verdict = needed === null || staffingUnknown ? 'UNGRADED'
      : known >= needed ? 'AVAILABLE' : missing.length ? 'UNGRADED' : 'SHORT';
    return { known_ft: known, is_floor: missing.length > 0 || staffingUnknown, missing, staffing_unknown: staffingUnknown,
      needed_ft: needed, short_by_ft: needed === null ? null : Math.max(0, needed - known), verdict,
      units: counted.map(u => u.id) };
  };
  return {
    all: summarize(engines),
    first_alarm: summarize(engines.filter(u => u.staffed_first_alarm === true), engines.some(u => typeof u.staffed_first_alarm !== 'boolean')),
    source: d.settings.apparatus?.source || 'NO NFPA SOURCE',
    rule: d.settings.apparatus_derivation?.null_rule || 'Unrecorded hose is unknown; known hose is a floor.',
  };
}
