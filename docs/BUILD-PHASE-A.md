# Phase A · the water math

Build this. It is pure arithmetic with no I/O, no framework and no network. Every number in the
acceptance tests below is fixed by the department's own coefficient table — do not adjust one to
make a test pass.

## The dividing line this project is built on

**The model identifies and decides. Code measures.**

Every function here is code. A model is never asked for a distance, a duration, a pressure or a
count. A model asked for "about 340 feet" returns a confident wrong number and somebody lays hose
against it.

## Files

    lib/water.ts        the pure functions, exported, no imports beyond node builtins
    test/water.test.ts  the ten acceptance tests, transcribed verbatim

## The physics

    friction_psi_per_100 = C * (flow_gpm / 100)^2

    available_friction_psi = min(
      hose_max_operating_psi,
      appliance_max_operating_psi,
      pump_available_discharge_psi_at_flow,
      department_discharge_cap_psi
    ) - receiving_intake_target_psi
      - fixed_appliance_loss_psi
      - safety_margin_psi

    maximum_segment_ft = 100 * available_friction_psi / friction_psi_per_100

    segments_needed     = ceil(total_distance_ft / recommended_segment_ft)
    intermediate_relays = max(0, segments_needed - 1)

Department defaults for this evolution: `C = 0.08` for 5-inch, hose max operating 180 psi,
receiving intake target 20 psi, safety margin 40 psi, recommended segment 1,500 ft.

Reject a scenario if any pressure allowance is zero or negative, if the source cannot sustain the
requested flow, or if a pump curve cannot support the flow and pressure together.

## THE TEN ACCEPTANCE TESTS — these are the specification

     1  5-inch, C=.08, 1000 gpm, 1500 ft, 20 psi intake -> FL 120 psi, required discharge 140 psi,
        margin below 180 = 40 psi
     2  the same case at 2000 ft -> FL 160 psi, required discharge 180 psi, additional margin 0
     3  5-inch, C=.08, 1500 gpm -> 18 psi per 100 ft. NOT 15. A 15 implies C = 0.0667 and the app
        must never mix coefficients silently
     4  six 180 gpm handlines -> demand 1,080 gpm
     5  a direct hydrant with no flow-test data -> `unknown`. Never a distance, never zero, never
        an optimistic capacity
     6  a drafting source does NOT trigger a positive 20 psi source-intake error
     7  a receiving relay below the configured intake threshold -> immediate warning
     8  a shuttle delivering 800 gpm against 1,000 gpm demand -> unsustainable, and returns
        dump-tank buffer time
     9  a 20,000-gallon usable pool at 1,000 gpm -> 20 minutes
    10  total distance 3,001 ft at a 1,500 ft recommended segment -> 3 segments, 2 intermediate
        relay pumpers

## Guardrails that belong IN the functions, not bolted on later

- Every returned figure carries the coefficient and the assumptions that produced it.
- Unverified or stale source data returns `unknown`. Never zero, never optimistic.
- Never apply the 20 psi positive-intake target to an engine that is drafting.
- Round segment lengths DOWN to deployable hose lengths, never up.
- Results are decision support. Nothing returns a pump command.

## Also needed for the screen

    demand_gpm(lines)            sum of nozzle flows
    tank_seconds(gallons, gpm)   how long the first engine's tank lasts
    shuttle_sustained_gpm(...)   tanker gallons and cycle time -> sustained supply
    pool_minutes(gallons, gpm)   usable volume / demand

The demo's single loudest fact: a 1¾ attack line and a 2½ monitor together run about 430 gpm, and
a 750-gallon tank is about a minute and forty-five seconds of water.

## Done when

`npm test` passes all ten. No test is edited to fit an implementation.
