# PHASE G · How Astra actually decides, and who challenges it

Owner's ruling 2026-09-10: **an adversarial review runs on every Astra decision before Command
sees it.** Clean context, a model that never saw the reasoning that produced the proposal.

---

## G.0 · THE DIVIDING LINE, restated because everything here depends on it

    THE MODEL IDENTIFIES AND DECIDES.      which hydrant, which side, which mode, where to stage
    CODE MEASURES.                          every distance, every gpm, every minute, every overlap

**If a number appears in an Astra reply that did not come from a tool result, that is a defect.**
Astra never types a distance. It picks between measured options and says why.

---

## G.1 · The five stages, and only two of them are the model

    1  ASSEMBLE     code       Firestore + tools build a FACT PACK. no model.
    2  PROPOSE      ASTRA      reads imagery + fact pack, returns a structured proposal
    3  CHECK        code       deterministic tests. a proposal that fails a test is marked, not dropped.
    4  CHALLENGE    ASTRA #2   CLEAN CONTEXT. attacks the proposal. never sees stage 2's reasoning.
    5  PRESENT      code       proposal + verdicts + open challenges. Command decides.

**Command never sees an unchallenged proposal.** That is the rule this phase exists to enforce.

---

## G.2 · Stage 1 · the fact pack

Every fact carries an `id`, a `value`, a `unit` and a `source`. Astra may only cite these ids.

    F.SITE.*        site, building placed by the IC, driveway length
    F.HYD.*         each hydrant: id, distance, gpm, flow-test age, status, SIDE OF ROAD
    F.APP.*         each rig: pump, tank, 5 in hose carried, staffed on first alarm
    F.DEM.*         demand from the selected attack lines, tank seconds
    F.RT.*          every routed leg: distance, duration, the road names
    F.STG.*         each candidate staging point, and its OVERLAP with the shuttle route
    F.POL.*         intake, margin, hose max, section length, turnout

The tools that produce them already exist as measurements. Wire each as an MCP tool:

    measure_lay(from,to)              ft, crosses_road, sections
    water_demand(line_ids[])          gpm, tank_seconds
    friction_loss(hose,gpm,length)    psi_per_100, total, discharge, margin, coefficient
    source_feasibility(id,demand)     verdict | unknown, limiting_component, why
    shuttle_plan(loop,tankers)        cycle_min, delivered_gpm, tankers_required
    hydrant_side_of_road(id,route)    LEFT | RIGHT, offset_m, closes_street
    route_overlap(route_a,route_b)    pct, points_shared, tolerance_m
    staging_candidates(bearing)       point, mi_out, overlap_pct, blocks_lane

`hydrant_side_of_road` and `route_overlap` are new and they are the two that produced the
findings that matter most. Both are pure geometry over a decoded polyline.

---

## G.3 · Stage 2 · PROPOSE

Astra receives the fact pack, the aligned imagery and the orientation definition. It returns
**only this shape**. Free text outside `why` is rejected by the parser.

```json
{
  "supply_mode":   {"pick":"shuttle_nurse","why":"...","grounded_in":["F.HYD.1-21.status","F.APP.E7.hose"]},
  "fill_site":     {"pick":"1-18","why":"...","grounded_in":["F.HYD.1-18.gpm","F.HYD.1-18.side"]},
  "lay_side":      {"pick":"RIGHT","why":"...","grounded_in":["F.SITE.driveway_ft"]},
  "staging":       {"pick":"CT-106","why":"...","grounded_in":["F.STG.106.overlap_pct"]},
  "tanker_count":  {"pick":4,"why":"...","grounded_in":["F.RT.loop.cycle_min"]},
  "unreadable":    ["what the imagery could not resolve"]
}
```

**Every `pick` must carry at least one `grounded_in` id that exists in the fact pack.** A pick with
an empty or unknown grounding is REJECTED by code before any human sees it. This is the single
check that stops a confident invention.

---

## G.4 · Stage 3 · CHECK, in code

    lay crosses a road that is not the intended endpoint      -> BLOCK
    hose carried < hose the pull needs                        -> BLOCK, with the shortfall in ft
    chosen hydrant flows < demand                             -> BLOCK
    chosen hydrant has no flow test                           -> UNGRADED, never green
    staging overlap with the shuttle route > 0 within 20 m    -> BLOCK
    portable tank < 1.4 x tanker capacity                     -> BLOCK  (NFPA 1142)
    static lift not surveyed on a draft proposal              -> UNGRADED
    tanker count asserted with no routed cycle                -> BLOCK

A BLOCK does not delete the option. **It renders it struck through with the reason**, exactly as the
mock does for HYDRANT and RELAY. An officer must be able to see what was ruled out and disagree.

---

## G.5 · Stage 4 · THE ADVERSARIAL PASS  ← the owner's ruling

**A SECOND MODEL SESSION, CLEAN CONTEXT.** It receives the fact pack and the proposal. It NEVER
receives stage 2's reasoning, its prompt, or its transcript — anchoring on the proposer's argument
is the failure this pass exists to prevent.

Its instruction is to attack, not to grade:

    what did this MISS entirely
    which pick is asserted on a fact that does not support it
    which placement would you have made differently, and on which fact
    what fails at 03:00 in the rain that reads fine in an office
    which number is stale — flow tests here are 696 days old
    what is SYNTHETIC being treated as measured

It returns challenges, and nothing else:

```json
{"challenges":[
  {"target":"staging",
   "severity":"BLOCK",
   "claim":"the staging pick reports 0 percent overlap for the INBOUND leg only. The leg from
            staging to the scene shares 45 percent of the shuttle route and is not stated.",
   "grounded_in":["F.STG.106.overlap_pct","F.RT.stage_to_scene.overlap_pct"],
   "test":"route_overlap(stage_to_scene, shuttle)",
   "would_have_picked":"CT-106, but present BOTH overlap figures"}]}
```

    severity BLOCK      Command sees it as an open challenge beside the proposal. The proposer
                        CANNOT dismiss it. Only the officer closes it.
    severity QUESTION   shown, collapsed, under the pick it targets
    severity NOTE       recorded in the record, not on the screen

**A challenge with an empty `grounded_in` is discarded**, the same rule the proposer lives under.
A reviewer that cannot cite a fact is speculating, and speculation on this screen costs attention.

### Who runs it

Any model in a clean session — Astra again, Sol, or a third. **The requirement is the clean context
and the separate call, not the vendor.** Record which model ran it beside the challenges, because a
challenge from a different model is different evidence than one from the same model twice.

---

## G.6 · Stage 5 · what Command sees

    the pick, large, in one word                      LAY RIGHT · SHUTTLE NURSE · FILL LEFT
    the reason, one line
    the checks, as struck-through options with reasons
    OPEN CHALLENGES, unresolved, beside the pick they target
    the model that proposed, and the model that challenged
    the elapsed time of each stage against the 80 s window

**An option with an open BLOCK challenge never renders green.**

---

## Done when

    a proposal with an ungrounded pick is REJECTED before it reaches a screen
    the adversarial pass runs in a session with no access to the proposer's reasoning
    a BLOCK challenge appears beside its pick and the proposer cannot clear it
    the two model names are on the screen
    a challenge with no grounded_in is discarded
    every number on the screen traces to a tool result, and the panel can show which
