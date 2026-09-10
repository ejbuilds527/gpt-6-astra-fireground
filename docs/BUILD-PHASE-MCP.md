# The MCP server · the only thing Astra calls

**Build this before the screens.** It is what makes Astra's role visible and provable: every
number the model states came back from a tool call here, and the diagnostic panel shows the calls.

## The division, and it is the whole pitch

    Astra          reads the site, ranks options, explains WHY, answers command's questions
    this server    measures, computes, and returns facts with their assumptions attached
    the officer    decides

Astra is never asked for a distance, a flow, a pressure or a count. If a number appears in a model
reply that did not come from a tool result, the app treats it as a defect.

## Where the data lives — already provisioned, read it, do not hardcode it

Firestore, project `meerkatops-fireground`, database `(default)`, location `nam5`. The Cloud Run
runtime identity already holds `roles/datastore.user`.

    settings/friction_coefficients   21 coefficients from the department table
    settings/policy                  intake target, margins, thresholds, turnout benchmark
    settings/attack_lines            nozzle presets with gpm
    settings/apparatus               tank gallons, pump ratings, hose carried
    sites/silver-hill                the incident site and 5 traced hydrants
    scenarios/hydrants-in-service    scenario A
    scenarios/all-hydrants-out       scenario B

**Every constant comes from Firestore.** A coefficient compiled into the code is the defect this
structure exists to prevent — the settings page must be able to change a result.

## The tools

    measure_lay(from_id, to)          -> { distance_ft, crosses_road: bool, sections }
    water_demand(line_ids[])          -> { gpm, tank_seconds, assumptions }
    friction_loss(hose, gpm, length)  -> { psi_per_100, total_psi, required_discharge, margin, coefficient }
    segment_plan(distance_ft)         -> { segments, intermediate_relays, recommended_segment_ft }
    source_feasibility(hydrant_id, demand_gpm)
                                      -> { verdict, sustainable_gpm | "unknown", limiting_component, why }
    shuttle_plan(...)                 -> ALWAYS { verdict: "ungraded", reason: "routing unavailable" }

Every return carries the coefficient and the assumptions that produced it. Every return that cannot
be computed returns `unknown` with a reason — never zero, never an optimistic default.

## The rules that must not bend

**A hydrant with no flow test returns `unknown`.** Never a capacity inferred from marker colour
alone, never from static pressure. NFPA 291 requires a flow test or live field readings.

**Marker colour is a CLAIM, not a measurement.** The traced hydrants carry an NFPA 291 colour class
read off the department's map. Treat it as a range with provenance, not a verified gpm.

**H4 is PRIVATE.** A private hydrant on hospital property is not automatically available. Surface
the ownership; do not silently rank it as public supply.

**`shuttle_plan` is honest about routing.** Travel time is an operator input, not a measurement.
It returns ungraded, and ungraded never renders green.

## The chat endpoint

    POST /api/ask   { question, scenario_id }  ->  { answer, tool_calls[], model }

Astra answers command's question by calling the tools above and citing what came back. The response
returns the tool calls so the diagnostic panel can render them. Server-side only; the key never
reaches the browser.

Worked example, and the demo turns on it:

    Q  "If I put the monitor in service, does H1 still hold?"
       water_demand(['1_75_smooth_180','2_5_smooth_250','monitor_500']) -> 930 gpm
       source_feasibility('H1', 930) -> H1 is NFPA 291 orange, 500-999 gpm — UNKNOWN above 999
    A  Astra reports the demand rose to 930 and that H1's class TOPS OUT at 999,
       so the margin is unverified. It does not claim H1 holds.

## The two scenarios

    A  hydrants in service     the nearest hydrant is the WEAKEST. H4 89 ft private under-500,
                               H3 133 ft under-500, H1 619 ft 500-999. Demand 430 gpm.
                               Astra must argue for H1 over the closer two, and say why.
    B  all hydrants out        every hydrant red-tagged. No positive-pressure option.
                               Tanker shuttle, fill site, portable ponds. Shuttle timings ungraded.

A toggle switches scenarios. Watching the recommendation flip is the demo.

## Done when

Astra answers a chat question by calling at least two tools, the panel shows the calls, and every
number in the answer traces to a tool result.
