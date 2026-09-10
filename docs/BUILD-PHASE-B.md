# Phase B · the sources compared          target 13:15 – 14:15

Depends on Phase A. Uses its functions; adds no new arithmetic of its own.

## Files

    lib/sources.ts        candidate fixtures and the comparison
    test/sources.test.ts  the cases below

## The three candidates — ALL VISIBLY SYNTHETIC

Every one carries `synthetic: true` and renders with that label. The checklist forbids implying
these are verified department records.

    H1  hydrant, 900 ft along the lay, flow test 1,250 gpm, tested 2025-06-11   VERIFIED
    H2  hydrant, 2,400 ft, NO FLOW TEST DATA                                     UNVERIFIED
    P1  pond, 3,100 ft, 20,000 gal usable, draft, no replenishment rate recorded UNVERIFIED

## What the comparison returns per candidate

    distance_ft            measured along the lay geometry, never estimated
    supply_mode            hydrant_direct | hydrant_pumped | portable_dump_tank | natural_static
    sustainable_gpm        or `unknown` — see the rule below
    relays_needed          from Phase A, when the mode is pumped
    feasibility            sustainable | time_limited | insufficient | unknown
    limiting_component     which of the six limits bound it
    why                    one plain sentence naming the numbers that decided it

## THE RULE THAT MUST NOT BEND

**A source with no flow-test data returns `unknown`. Never a distance-derived guess, never zero,
never an optimistic capacity.** H2 exists in the fixture set specifically to prove this. Acceptance
test 5 in `BUILD-PHASE-A.md` is the same rule.

A pond with no recorded replenishment rate is `time_limited`, never `continuous`.

## The hydrant-versus-shuttle decision

Inside roughly 3,000 ft, recommend inserting a relay pumper. Beyond it, call for a tanker shuttle.
State which decision was made and the distance that decided it.

**Do not present ~3,000 ft as a universal safe operating limit.** It is this department's operating
target. Display it as such, with the coefficient and margin that produced it.

## Done when

`npm test` passes, H2 returns `unknown`, and the screen names the chosen source and the reason.
