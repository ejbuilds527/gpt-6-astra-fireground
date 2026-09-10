import type { Snapshot } from './data';
import { editableSettings } from './incident';

/** Only editable inputs cross the settings boundary; apparatus snapshots never do. */
export function settingsInputs(snapshot: Snapshot) {
  return {
    ...editableSettings(snapshot),
    calculation: {
      policy: { hose_section_ft: snapshot.settings.policy?.hose_section_ft ?? null },
      derivation: { null_rule: snapshot.settings.apparatus_derivation?.null_rule ?? 'Unknown hose makes the known sum a floor.' },
      relay: { road_distance_ft: snapshot.relay.road_distance_ft ?? null },
    },
    attack: {
      revision: snapshot.settings.attack_lines?.revision ?? 0,
      source: snapshot.settings.attack_lines?.gpm_source ?? snapshot.settings.attack_lines?.source ?? 'NO NFPA SOURCE',
      lines: (snapshot.settings.attack_lines?.lines ?? []).map((line: Record<string, unknown>) => ({
        id: line.id, name: line.name ?? line.label ?? line.id,
        gpm: line.gpm ?? null, default_on: line.default_on === true,
      })),
    },
  };
}
