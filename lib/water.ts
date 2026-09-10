/** Pure hydraulics. Department inputs are supplied by the Firestore adapter, never defaults. */
export type Unknown = { value: 'unknown'; why: string };
export type Result<T> = { value: T } | Unknown;
export const unknown = (why: string): Unknown => ({ value: 'unknown', why });
export const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const positive = (n: unknown): n is number => valid(n) && n > 0;
const result = (value: number): Result<number> => Number.isFinite(value) ? { value } : unknown('Non-finite result');
export function frictionLoss(coefficient: number, gpm: number, lengthFt: number): Result<number> {
  if (!positive(coefficient) || !valid(gpm) || !valid(lengthFt)) return unknown('Missing or invalid coefficient, flow, or length');
  // Q is hundreds of US gallons/minute; L is hundreds of feet. Unit conversions, not policy.
  return result(coefficient * (gpm / 100) ** 2 * (lengthFt / 100));
}
export function requiredDischarge(frictionPsi: number, intakePsi: number, elevationPsi: number, appliancePsi: number): Result<number> {
  if (![frictionPsi, intakePsi, appliancePsi].every(valid) || !Number.isFinite(elevationPsi)) return unknown('Intake, elevation and appliance losses must all be supplied');
  return result(frictionPsi + intakePsi + elevationPsi + appliancePsi);
}
export function margin(dischargePsi: number, hoseMaxPsi: number, departmentCapPsi: number): Result<number> {
  if (![dischargePsi, hoseMaxPsi, departmentCapPsi].every(valid)) return unknown('Missing discharge or pressure limits');
  return result(Math.min(hoseMaxPsi, departmentCapPsi) - dischargePsi);
}
export type SegmentPolicy = { receiving_intake_target_psi: number; hose_max_operating_psi: number; department_discharge_cap_psi: number; safety_margin_psi: number; recommended_segment_ft: number; hose_section_ft: number };
export function maxSegment(coefficient: number, gpm: number, policy: SegmentPolicy, elevationPsi: number, appliancePsi: number): Result<number> {
  const loss = frictionLoss(coefficient, gpm, 100);
  if (loss.value === 'unknown') return loss;
  if (!positive(loss.value) || ![policy.receiving_intake_target_psi, policy.hose_max_operating_psi, policy.department_discharge_cap_psi, policy.safety_margin_psi, appliancePsi].every(valid) || !Number.isFinite(elevationPsi) || !positive(policy.hose_section_ft)) return unknown('Missing pressure budget, nonzero flow, or section length');
  const budget = Math.min(policy.hose_max_operating_psi, policy.department_discharge_cap_psi) - policy.receiving_intake_target_psi - policy.safety_margin_psi - elevationPsi - appliancePsi;
  if (budget <= 0) return unknown('No pressure budget remains for friction');
  return result(Math.floor((budget / loss.value * 100) / policy.hose_section_ft) * policy.hose_section_ft);
}
export function segmentCount(distanceFt: number, segmentFt: number, sectionFt: number): Result<{ segments: number; intermediate_relays: number; sections: number; hose_ft: number }> {
  if (!positive(distanceFt) || !positive(segmentFt) || !positive(sectionFt)) return unknown('Positive distance, segment and section length required');
  const deployable = Math.floor(segmentFt / sectionFt) * sectionFt;
  if (!positive(deployable)) return unknown('Segment cannot hold a complete hose section');
  const sections = Math.ceil(distanceFt / sectionFt);
  const segments = Math.ceil(sections * sectionFt / deployable);
  return { value: { segments, intermediate_relays: segments - 1, sections, hose_ft: sections * sectionFt } };
}
export function demand(flows: number[]): Result<number> {
  if (!flows.length || !flows.every(positive)) return unknown('Each selected line requires a measured positive flow');
  return result(flows.reduce((a, b) => a + b, 0));
}
export function tankSeconds(gallons: number, gpm: number): Result<number> {
  if (!positive(gallons) || !positive(gpm)) return unknown('Positive tank volume and demand required');
  return result(gallons / gpm * 60);
}
export function shuttleCycle(gallons: number, fillGpm: number, driveMin: number, dumpMin: number, manoeuvreMin: number): Result<{ fill_min: number; cycle_min: number; delivered_gpm: number }> {
  if (![gallons, fillGpm, driveMin, dumpMin].every(positive) || !valid(manoeuvreMin)) return unknown('Routed drive time, tank capacity, fill rate, dump and manoeuvre time required');
  const fill_min = gallons / fillGpm;
  const cycle_min = fill_min + driveMin + dumpMin + manoeuvreMin;
  return { value: { fill_min, cycle_min, delivered_gpm: gallons / cycle_min } };
}
export function tankersRequired(demandGpm: number, deliveredGpm: number): Result<number> {
  if (!positive(demandGpm) || !positive(deliveredGpm)) return unknown('Demand and delivery from a routed cycle are required');
  return result(Math.ceil(demandGpm / deliveredGpm));
}
