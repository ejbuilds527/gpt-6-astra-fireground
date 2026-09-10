# BUILD THIS. Everything is settled and every number is measured.

One Next.js app on Cloud Run. All data is already in Firestore and GCS — read it, never hardcode it.

## THE DIVISION OF LABOUR — this is the product, not an implementation detail

    ASTRA (gpt-5)   reads the site imagery, ranks options, explains WHY, answers command's questions,
                    and says plainly what it cannot know
    MCP TOOLS       every number. distance, demand, friction, segments, cycle time, tanker count
    THE OFFICER     decides. Astra never commits anything.

**If a number appears in an Astra reply that did not come from a tool result, that is a defect.**
The diagnostic panel renders every tool call so this is provable, not asserted.

## DATA — already provisioned, project `meerkatops-fireground`

Firestore `(default)`, nam5. Runtime identity already has `roles/datastore.user`.

    settings/friction_coefficients   21 coefficients, the department's own table
    settings/policy                  20 psi intake · 40 psi margin · 180 psi hose max
                                     1500 ft segment · 2000 relay · 3000 shuttle · 80 s turnout
    settings/attack_scenario         1¾ smoothbore 180 + 2½ BlitzFire 500 = 680 gpm · tank 66 s
    settings/apparatus               E7 750 gal · Tanker 8 3000 gal (NURSE, does not shuttle)
    settings/mutual_aid              7 departments, geocoded, with arrival bearings
    sites/silver-hill                campus + hydrants 1-07, 1-09, 1-21
    sources/fill-route-hydrants      1-18 855.87 gpm · HYD_862/863/864/865 all under 500, LOW
    routes/shuttle-loop              2.82 mi, 6.0 min drive, 4 tankers, 772 gpm
    routes/relay-pull                4754 ft, 3.70 psi/100ft, 2-3 relays, 2800 ft hose short
    scenarios/general-alarm          state 1
    scenarios/lodge-confirmed        state 2

GCS `gs://fireground-mapdata` — `site/silver-hill/` holds the satellite and roadmap pair with
identical bounds, plus `bounds.json`. Runtime has `objectViewer`.

## THE DEMO, IN ORDER

    1  TONE          general alarm, 208 Valley Rd, NO BUILDING. 80 s clock starts.
    2  ASTRA PLANS   against the campus centroid. It SAYS it is planning against a centroid.
    3  IC CONFIRMS   "it's the Lodge, Michael's House". One tap.
    4  RECALCULATE   everything moves. 1-21 was furthest at 867 ft, now nearest at 148 —
                     and it is RED-TAGGED. 1-07 and 1-09 are both ~780 ft and BOTH short of 680.
    5  OPTIONS       shuttle (4 tankers, 772 gpm, 14 min loop) or relay (4754 ft, 2800 ft hose short)
    6  OFFICER PICKS and mutual-aid staging follows from the choice

**Step 4 is the demo.** Watching the ranking invert is what makes it obviously live.

## THE TOOLS

    measure_lay(from, to)            distance_ft, crosses_road, sections
    water_demand(line_ids[])         gpm, tank_seconds
    friction_loss(hose, gpm, length) psi_per_100, total, discharge, margin, coefficient
    segment_plan(distance_ft)        segments, intermediate_relays
    source_feasibility(id, demand)   verdict, gpm | unknown, limiting_component, why
    shuttle_plan(loop, tankers)      cycle_min, delivered_gpm, tankers_required
    mutual_aid_bearings()            arrival compass per department

Every return carries its coefficient and assumptions. Anything uncomputable returns `unknown`
with a reason — never zero, never an optimistic default.

## THE CHAT COMPOSER — build this, it is how Astra is seen working

    POST /api/ask  { question, scenario_id, selected_option }
      -> { answer, tool_calls: [{name, input, output, ms}], model, elapsed_ms }

The composer sits under the diagnostic panel. Command types, Astra answers by calling tools, and
the panel renders each call as it lands. Server-side only; the key never reaches the browser.

Worked exchanges to support:

    "Why not the hydrant in front of the building?"
    "How many tankers do I need?"
    "What if I add a second handline?"
    "Can we relay instead?"

## THE RULES THAT MUST NOT BEND

    a hydrant with no flow test returns `unknown`. never a guess, never zero.
    a red-tagged hydrant is SHOWN red-tagged. never silently dropped.
    ungraded NEVER renders green.
    flow-test age is first class. 1-07 and 1-18 are both 696 days stale.
    synthetic and simulated values are labelled as such.
    training mode is labelled.
    never claim a tanker count without a routed cycle time. we HAVE one now, so state it.

## VISUAL

Meerkat brand dark scheme. Canvas `#1c1f25`, panels `#23272e`, hairlines
`rgba(140,193,210,.14)`, teal `#2d7a82` for structure, `#5aabb3` accent text, orange `#EF8200`
for caution and CTA ONLY. No fire-red. Status is colour on the word. Numbers are tabular mono.

Mockup: the published design canvas. Match it.

## PHASES E AND F — OWNER RULINGS, AND THEY ARE NOT OPTIONAL

    E.1  the 80 second turnout clock, visible, with per-stage measured times
    E.2  THREE surfaces — command, staging, shuttle. Each login sees ONLY what it needs.
         chosen from the WorkOS org's role_view. all three logins are proven.

    F    THE SETTINGS PAGE — apparatus and hose length are EDITABLE and the math follows.
         nothing derived is stored. editing E7's hose flips the relay verdict live.

Read `docs/BUILD-PHASE-E.md` and `docs/BUILD-PHASE-F.md`. All three read from Firestore and need
no new data source.

## DONE WHEN

The scenario runs on `https://fireground.meerkatops.app`, the IC confirmation visibly recalculates
everything, Astra answers a typed question by calling at least two tools, the panel shows the calls,
and every limitation is on the screen.
