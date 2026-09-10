# Fireground

**Fireground decides how water reaches a fire.** Which hydrant, which side of the road, how many
tankers, and how to do it without closing the road.

Built for the GPT-6 Astra hackathon, 10 September 2026, against a real address and real hydrant
records from the New Canaan, Connecticut fire department.

    live      https://fireground.meerkatops.app
    demo      https://fireground.meerkatops.app/demo/record7.html
    the app   https://fireground.meerkatops.app/app/command

---

## The rule everything is organised around

    THE MODEL IDENTIFIES AND DECIDES.   which hydrant, which side, which mode, where to stage
    CODE MEASURES.                       every distance, every gpm, every minute, every overlap

**If a number appears in a model reply that did not come from a tool result, that is a defect.**

---

## Two models, and they are not the same model

`POST /api/decide` runs five stages and streams each one as it lands.

| stage | by | measured live |
|---|---|---|
| 1 ASSEMBLE the fact pack | code | 336 ms |
| 2 PROPOSE | `gpt-6-astra` | 101,496 ms |
| 3 CHECK, deterministically | code | 1 ms |
| 4 CHALLENGE, clean context | `gpt-5.6-sol` | 65,855 ms |
| 5 PRESENT | code | 0 ms |

**The grounding gate.** Every pick cites fact ids. A pick that cannot is rejected in code before a
human sees it and renders `NEEDS A MEASUREMENT`.

**The clean context.** The challenger gets the fact pack and the proposal and nothing else. Never
the proposer's reasoning. Anchoring on the argument is the failure that pass prevents.

### Two things the models did that we kept

**Astra refused to pick a hose lay side.** *"The pack identifies hydrant sides relative to routed
polylines, not a measured hose-lay side along the private drive. Neither driveway side can be
selected defensibly."* It named the four measurements it lacked. We shipped the refusal.

**Sol caught an error we had not seen.** The app reported 949 gpm delivered from a hydrant tested
at 855.87 gpm. A closed shuttle cannot deliver more than its source replenishes. That check runs
in production now and the app reports 855.9.

### And one thing it did on its own

**Astra traced an 823 ft private driveway out of a satellite image** as ordered pixel fractions.
It is never asked for a distance. Code projects the pixels and measures: **802 ft against the
department's recorded 823.**

---

## Five roles, five surfaces, one incident

The surface is chosen by the WorkOS organisation's `role_view`, never by a user flag. Every member
of a department responds from the same house and does the same job on the incident.

| role | login | sees |
|---|---|---|
| command | `command@fireground.xyz` | everything. the only screen that decides. |
| staging | `staging@fireground.xyz` | where to stage and the hold. no water math. |
| shuttle | `shuttle@fireground.xyz` | the loop, the rotation, the cycle. |
| tanker | `tanker@fireground.xyz` | my next move only. not the whole loop. |
| relay | `relay@fireground.xyz` | my segment only. where to park, what pressure. |

Password is the role name plus `-fireground`. Demo credentials, synthetic incident.

---

## What is actually running

    Cloud Run          the Next.js app, one service, us-east1
    Cloud Build        builds from source on every push to main
    Firestore          14 settings documents plus sites, sources, routes, scenarios
    Cloud Storage      the satellite and roadmap bundle with its bounds
    Secret Manager     every key referenced BY NAME. No value in the repo or a log.
    Workload Identity  keyless CI. The org forbids service account keys and none exists.
    WorkOS AuthKit     five organisations, one per role

**Map data.** Google Directions for every polyline and travel time. Google Static Maps for the
base tiles, restyled to the panel palette, and for the satellite imagery Astra reads. Hydrant
records come from the department's own responder application with their flow-test dates.

**A lay is a polyline along pavement, never a straight chord.** Each vertex is offset
perpendicular to its own segment bearing. Side of road is the sign of the cross product against
the routed line, and Google's own turn instruction confirmed the first result independently.

---

## Everything that decides an answer is a setting

Engine 7's hose was recorded as 2,000 ft, then 2,500, before the department gave 1,500.

    E7 2,500 + E2 2,500 = 5,000     relay needs 4,800     AVAILABLE on the first alarm
    E7 1,500 + E2 2,500 = 4,000     relay needs 4,800     SHORT by 800 ft

Same screen, same fire, opposite decision. **The number is the decision**, so it lives on a page
an officer can correct rather than in a constant in a file.

**Nothing derived is stored and read back.** A stored answer beside an edited input is a lie the
screen tells confidently.

---

## The arithmetic

    FL per 100 ft = C x (Q/100)^2  =  0.08 x (680/100)^2  =  3.70 psi per 100 ft
    180 hose max - 20 intake - 40 margin = 120 psi available
    max segment = 100 x 120 / 3.70 = 3,244 ft

    fill  = tank / min(hydrant, tanker fill rate)
    dump  = tank / dump rate
    cycle = travel + fill + dump + manoeuvre
    tankers = ceil(demand / (tank / cycle))

**The hydrant is the ceiling.** Delivered flow can never exceed the fill source's own tested flow,
however many tankers run.

`NFPA 1710` turnout · `1900` apparatus · `1142` rural supply · `1962` hose pressure · `291` hydrant class

---

## What is NOT solved

**A one-way loop through a road network is a graph search and no tool does it.** The loop in this
demo was found by a firefighter naming the roads. Astra found the driveway in a satellite photo by
itself. It still needed a person to tell it the circuit existed.

**Queue time at the fill site is not modelled.** With more than two tankers on one fill point the
cycle is a floor, not a total, and the screen says so.

**Every tanker capacity is SYNTHETIC** and stays labelled through every calculation. **Elevation
is assumed flat.** **Shoulder widths on the drive are unsurveyed**, which is why the model refused
a lay side.

**A known exposure.** A Static Maps image is a keyed URL, so the Maps key appears in the rendered
`img src`. It is restricted at the console. Proxying the bytes through a route handler is the
proper fix and is recorded at the top of `lib/staticmap.ts`.

---

## Reading order

    docs/HOW-IT-WORKS.md      how it is built, in full
    docs/BUILD-NOW.md         the build brief
    docs/BUILD-PHASE-G.md     the decision loop and the adversarial pass
    tools/astra-loop.py       the five stage loop, runnable
    tools/astra-vision.py     the satellite trace, runnable
    lib/geo.ts                the geometry: polylines, offsets, side of line

## Run it

    npm install
    npm run dev

Needs `OPENAI_API_KEY`, `MAPS_API_KEY`, and the WorkOS keys, by name only. Firestore access comes
from application default credentials.

---

Apache 2.0. Demonstration decision support. **Not verified operational guidance.**
