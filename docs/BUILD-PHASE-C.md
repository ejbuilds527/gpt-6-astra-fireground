# Phase C · Astra proposes, code checks     target 14:15 – 15:15

**This phase is the demo.** If the clock slips, build this before Phase D. A working decision loop
on a plain screen beats a beautiful screen with no loop.

## Files

    lib/propose.ts        the model call and its schema
    lib/verify.ts         the deterministic checks
    test/verify.test.ts   including one deliberately invalid proposal

## The call

Server-side only. The key never reaches the browser. Give the model:

    the candidate table from Phase B, each with its identifier and MEASURED facts
    the orientation definition — street toward structure, left/right relative to that
    the apparatus inventory and carried hose

Ask it for: a chosen candidate BY IDENTIFIER, a lay-side proposal, its reasoning, and an explicit
list of anything it could not read or was uncertain about.

**Never ask it for a distance, a flow, a duration or a count.** If a number appears in the reply
that was not in the facts supplied, that is a defect and the verifier rejects it.

## The checks, in code

    crossing        does the proposed lay intersect the road centreline? polyline vs polyline,
                    exact, microseconds. Endpoint contact is NOT a crossing — handle separately.
    range           is the measured distance within the supply mode's limit
    hose inventory  is enough hose carried, rounded DOWN to deployable section lengths
    completeness    is any required input missing or stale

## The verdict, and it must be honest

    satisfied   the check ran and passed
    unmet       the check ran and failed
    ungraded    the check could not run

**Ungraded NEVER renders green.** A stage that did not run shows as not run.

## The rejection loop

On an unmet check, pass the specific failure back for ONE bounded revision. Stop after a small
fixed attempt limit and surface the failure. Never loop indefinitely.

## The moment judges remember

Demonstrate a deliberately invalid proposal caught by the checker — a lay that crosses the road.
**Label it as an injected test.** Presenting a staged failure as a spontaneous model result is
misrepresentation and the checklist forbids it.

## Timing

Time each stage and display it. The source document's target is roughly sixty seconds from tone to
analysis. Measure it; do not assert it.

## Done when

A real model response resolves to known identifiers, code checks it independently, and the screen
shows an honest verdict including at least one unmet or ungraded result.
