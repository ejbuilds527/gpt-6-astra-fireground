# Fireground · how it is built

One fire, one afternoon, and every number on the screen traceable to something measured.

---

## The rule everything is organised around

    THE MODEL IDENTIFIES AND DECIDES.   which hydrant, which side, which mode, where to stage
    CODE MEASURES.                       every distance, every gpm, every minute, every overlap

**If a number appears in a model reply that did not come from a tool result, that is a defect.**

---

## What OpenAI does, at runtime

Two models run on every incident and they are deliberately not the same model.

| stage | by | measured on the live service |
|---|---|---|
| 1 ASSEMBLE the fact pack | code | 336 ms |
| 2 PROPOSE | `gpt-6-astra` | 101,496 ms |
| 3 CHECK, deterministically | code | 1 ms |
| 4 CHALLENGE, clean context | `gpt-5.6-sol` | 65,855 ms |
| 5 PRESENT | code | 0 ms |

`POST /api/decide` streams one JSON object per stage as newline-delimited JSON, so the screen
fills as the run happens rather than jumping at the end.

**The grounding gate.** Every pick carries `grounded_in`, a list of fact ids from the pack. A pick
with an empty or unknown grounding is REJECTED IN CODE before a human sees it and renders
`NEEDS A MEASUREMENT`. The same rule applies to challenges: one that cites no fact is discarded.

**The clean context is the point.** The challenger receives the fact pack and the proposal and
nothing else. Never the proposer's prompt, reasoning or transcript. Anchoring on the argument is
the failure that pass exists to prevent.

**Astra also reads imagery.** It traced an 823 ft private driveway out of a satellite tile as
ordered pixel fractions. It is never asked for a distance. Code projects the pixels through the
known Web Mercator projection and measures: 802 ft against the department's recorded 823.

### Two things the models did that we kept rather than removed

Astra REFUSED to choose a hose lay side. Its words: *"The pack identifies hydrant sides relative
to routed polylines, not a measured hose-lay side along the private drive. Neither driveway side
can be selected defensibly."* It named the four measurements it lacked.

Sol caught an error we had not seen. The app reported 949 gpm delivered from a hydrant tested at
855.87 gpm. **A closed shuttle cannot deliver more than its source replenishes.** That check runs
in production now and the app reports 855.9.

---

## What OpenAI did in development

Codex wrote the application code and made the commits. **57 commits landed on `main` during the
event and 52 carry `Co-Authored-By: GPT-6 Astra via Codex`.**

---

## The map data

| what | from | used for |
|---|---|---|
| road polylines | Google Directions | every distance and travel time |
| base tiles | Google Static Maps, restyled to the panel palette | the drawing |
| satellite imagery | Google Static Maps | Astra traces the driveway from it |
| hydrant records | the department's own responder application | flow, class, service and flow-test dates |
| everything else | Firestore | apparatus, policy, mutual aid, scenarios, rubrics |

**A lay is a POLYLINE ALONG PAVEMENT, never a straight chord.** Each vertex is offset
perpendicular to ITS OWN segment bearing, so the line hugs the correct edge through every bend.
Side of road is the sign of the 2D cross product against the routed line, and Google's own turn
instruction independently confirmed the first result: *"Destination will be on the left."*

---

## What GCP does

    Cloud Run          the Next.js app, one service, astra-fd, us-east1
    Cloud Build        builds the container from source on every push to main
    Firestore          every setting, site, source, route and scenario. 14 settings documents.
    Cloud Storage      the satellite and roadmap bundle with its bounds
    Secret Manager     WorkOS keys, the OpenAI key, the Maps key. Referenced BY NAME.
    Workload Identity  keyless CI. The org forbids service account keys and none exists.
    WorkOS             five organisations, one per role. The surface is chosen by org metadata.

**A leak we designed out.** No secret value appears in the repository, in the workflow or in a
log. `--set-secrets` names them and Cloud Run resolves them at deploy.

**A leak we did not.** A Static Maps image is a keyed URL, so the Maps key appears in the rendered
`img src`. It is restricted at the console. Proxying the bytes through a route handler is the
proper fix and is recorded as a known limitation at the top of `lib/staticmap.ts`.

---

## The settings, and why they are settings

Every figure that decides an answer is editable, because **the number is the decision.**

Engine 7's hose was recorded as 2,000 ft, then 2,500, before the department gave 1,500.

    E7 2,500 + E2 2,500 = 5,000     relay needs 4,800     AVAILABLE on the first alarm
    E7 1,500 + E2 2,500 = 4,000     relay needs 4,800     SHORT by 800 ft

Same screen, same fire, opposite decision.

| document | what it holds |
|---|---|
| `settings/apparatus` | every rig: pump, tank, 5 in hose carried, role, first-alarm staffing |
| `settings/apparatus_derivation` | the rules. A tanker's hose is not supply hose. A null is a FLOOR. |
| `settings/attack_lines` | three lines off one engine, toggled. 1¾ 180, 1¾ 180, 2½ 500. |
| `settings/policy` | C 0.08, 180 psi hose max, 20 psi intake, 40 psi margin, 3,244 ft max segment |
| `settings/friction_coefficients` | 21 coefficients, the department's own table |
| `settings/shuttle_timing` | fill and dump rates with their NFPA sources |
| `settings/supply_modes` | the five ways water reaches a fire, and why each is in or out |
| `settings/lay_rubric` | R0 to R12 and their precedence. R0 is the circuit-board rule. |
| `settings/adversarial_rubric` | the nine checks the challenger runs, C1 to C9 |
| `settings/staging`, `staging_gap` | the eight companies, their bearings, the closure |
| `settings/relay_assignments` | four segments, three intermediate pumpers, who parks where |
| `settings/turnout` | the 80 s window, the stage budgets, the paint-order ruling |
| `settings/dispatch` | the tone, the voice, the department's own call format |
| `settings/departments_auth` | five WorkOS organisations, one per role_view |

**Nothing derived is stored and read back.** A stored answer beside an edited input is a lie the
screen tells confidently.

---

## The rules that decide where a hose goes

**R0 · LAY IT LIKE A CIRCUIT TRACE.** Traces run on one layer and do not cross. A crossing is a
short. On a fireground the short is a CLOSED STREET, and a closed street is one you can no longer
bring mutual aid in on. A crossing is never a local decision.

    R1  follow the road. a polyline, never a chord
    R2  left and right are always relative to THAT rig's direction of travel
    R3  lay toward where the rig must FINISH. attack pump finishes at the fire, so LAY IN.
    R4  stay on the side the driveway connects to. walk it like a sidewalk.
    R5  cross at most ONCE, at the source, and ramp it
    R6  never cross at the hand-off
    R7  offset each vertex perpendicular to its own segment bearing
    R8  draw to scale. 5 in in a 12 ft lane is 3.5 percent of the width.
    R9  prefer the wider shoulder          } tie-breakers, never overriding R4, R5 or R6
    R10 prefer the connection side          }
    R11 REFUSE rather than guess. name the missing fact.
    R12 when the destination is a CLOSED segment, the free crossing is at the closure itself

---

## The arithmetic

### Friction loss

    FL per 100 ft = C x (Q/100)^2
                  = 0.08 x (680/100)^2  =  3.70 psi per 100 ft

    180 psi hose max  -  20 intake  -  40 margin  =  120 psi available
    max segment = 100 x 120 / 3.70                =  3,244 ft
    the pull is 4,754 ft -> 4 segments of 1,188 ft -> 44 psi each -> within budget

Never mix C 0.08 with 0.0667 silently. At 1,500 gpm they differ by 3 psi per 100 ft.
180 psi is the NFPA 1962 MARKED maximum, not the service-test pressure.

### The shuttle

    fill   = tank / min(hydrant, tanker fill rate)  = 2,500 / min(856, 1,000) = 2.92 min
    dump   = tank / dump rate                       = 2,500 / 1,500           = 1.67 min
    travel = routed, the whole one-way loop
    cycle  = travel + fill + dump + manoeuvre
    per tanker = tank / cycle
    tankers    = ceil(demand / per tanker)

**THE HYDRANT IS THE CEILING.** Delivered flow can never exceed the fill source's own tested flow,
however many tankers run. Where the count would need the hydrant more than 100 percent of the
time, the app says so and reports the cycle as a FLOOR, because queue time is not modelled.

### The standards

    NFPA 1710   80 second turnout
    NFPA 1900   tanker fill and dump, 1,000 gpm minimum. Rated pump capacity, not assumed.
    NFPA 1142   portable tank 1.4x the tanker. Static lift 10 ft maximum for draft.
    NFPA 1962   180 psi marked maximum, NOT service-test pressure
    NFPA 291    hydrant class from a flow test, never from colour

---

## What is NOT solved, stated so nobody mistakes it for solved

**A one-way loop through a road network is a graph search and no tool does it.** The loop in this
demo was found by a firefighter naming the roads. Astra traced the driveway from a satellite image
by itself. It still needed a person to tell it the circuit existed.

**Queue time at the fill site is not modelled.** With more than two tankers on one fill point the
stated cycle understates the truth, and the screen says so.

**Every tanker capacity is SYNTHETIC** and stays labelled through every calculation.

**Elevation is assumed flat** and stated as an assumption, not a measurement.

**Shoulder widths and obstructions on the drive are unsurveyed.** That is why the model refused a
lay side, and the refusal is the honest output.

**Two routes claim `/app/command`.** The static segment wins, so `app/app/[role]/page.tsx` is
unreachable. Deleting one is the real fix and was left alone during a recording.
