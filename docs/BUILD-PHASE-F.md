# PHASE F · The settings page. The inputs are editable and the math follows them.

Owner's ruling 2026-09-10: **the apparatus list and the hose length on each rig are settings.
Change a setting and the inputs to the math change.**

This is not a preferences screen. It is where the officer states what their department actually
carries, and every number on the incident screen is computed from it.

## WHY THIS IS THE MOST IMPORTANT PAGE IN THE APP

Engine 7's hose was recorded as **2,000 ft**, then **2,500 ft**, before the department gave
**1,500 ft**.

    E7 2,500 + E2 2,500 = 5,000     relay needs 4,800     AVAILABLE on the first alarm
    E7 1,500 + E2 2,500 = 4,000     relay needs 4,800     SHORT by 800 ft

**The same screen, the same fire, the opposite decision.** A figure that decides the answer belongs
on a page the officer can correct, not in a constant in a file.

**THE NUMBER IS THE DECISION.**

---

## F.1 · The apparatus table, editable

Read and write `settings/apparatus`, field `units`. One row per rig.

    FIELD                  EDITABLE   UNIT     SOURCE SHOWN BESIDE IT
    id                     no         --       the department's own designator
    label                  yes        --
    pump_gpm               yes        gpm      NFPA 1900 rated capacity, not an assumed figure
    tank_gal               yes        gal      NFPA 1900
    hose_5in_ft            yes        ft       the department's own inventory
    role                   yes        --       attack · supply · engine · tanker · nurse
    staffed_first_alarm    yes        --       six career staff put TWO rigs on the road

As the record stands today:

    E7   Engine 7    1500 gpm   750 gal    1500 ft   attack
    E2   Engine 2    1500 gpm   500 gal    2500 ft   MAIN WATER SUPPLY RIG
    E4   Engine 4    1500 gpm   750 gal    1400 ft   engine
    E1   Engine 1    1500 gpm   750 gal    NOT SET   engine
    T8   Tanker 8    1500 gpm   3000 gal    500 ft   NURSE at the dump — does not shuttle

**Engine 1's hose is not recorded.** Engine 1 and Engine 7 are the same spec, so 1,500 ft is
plausible. **Do not assume it.** Render `NOT SET`, let the officer type it, and keep it out of every
sum until they do.

### Adding and removing a rig

The officer can add a row and delete a row. A department that runs three engines is not a special
case. **No apparatus id is hardcoded anywhere** — if `T8` appears in a condition in the code, that
is a defect.

---

## F.2 · The recompute contract

**NOTHING DERIVED IS EVER STORED AND READ BACK.** A stored answer beside an edited input is a lie
the screen tells confidently.

`settings/apparatus` carries three snapshot fields from 2026-09-10 —
`total_5in_ft_new_canaan`, `hose_finding`, `relay_hose_needed_ft`. They are listed in that
document's own `derived_fields` and marked with `derived_warning`. **Never display them.** Compute
instead, using `settings/apparatus_derivation`:

    SUPPLY-LINE TOTAL   sum hose_5in_ft over units with an ENGINE role.
                        A TANKER's hose is not supply-line hose. T8's 500 ft is EXCLUDED.
    NULL                UNKNOWN, never zero. A sum containing an unknown is a FLOOR:
                        "5,400 ft known, Engine 1 not recorded". Never present a floor as a total.
    FIRST ALARM         only units with staffed_first_alarm count. TWO rigs.
    RELAY NEEDED        relay_pull_ft rounded UP to a whole hose section (settings/policy).
                        relay_pull_ft is ROUTE GEOMETRY, not an apparatus figure.
    VERDICT             AVAILABLE when counted >= needed. SHORT by the difference otherwise.
                        UNGRADED when a counted unit's hose is null and the known sum is below
                        the requirement, because the unknown could close the gap.
                        UNGRADED NEVER RENDERS GREEN.

### What an edit must move

Edit any hose figure and every one of these changes on the incident screen, with no reload:

    the supply-line total, and whether it is a total or a floor
    the relay verdict, and the SHORT-BY number
    which wave the relay becomes possible in
    the shuttle-versus-relay comparison
    the sentence Astra is given about hose, because Astra reads facts and must not read stale ones

**The last one is the trap.** If the model gets a cached hose sentence it will reason correctly
from a wrong premise, and that is the worst failure this app can have.

---

## F.3 · Every setting names its source

Already required and already in the mock. Each row carries the standard it comes from.

    friction coefficients    the department's own table, 21 coefficients
    intake and margin        NFPA 1962 · marked max, NOT service-test pressure
    hydrant classes          NFPA 291 flow test, never hydrant colour or static pressure
    pump and tank            NFPA 1900 · rated capacity, not an assumed capacity
    turnout 80 s             NFPA 1710 · response performance, not hydraulics
    rural supply             NFPA 1142 framework

**A setting with no cited source reads `NO NFPA SOURCE` rather than being left blank.** A blank
reads as an oversight. The label is the honest answer.

---

## F.4 · Synthetic values stay labelled through the edit

Every tanker capacity in the mutual aid roster is synthetic and is flagged
`tanker_gallons_source: SYNTHETIC`. If the officer edits one, the flag becomes
`EDITED BY <org display name>` — it does not silently become a verified figure.

**A number's provenance survives an edit.** Verified, synthetic and edited are three different
things and the screen says which.

---

## Done when

    the apparatus table edits label, pump, tank, hose, role and first-alarm staffing
    a rig can be added and a rig can be deleted, and no apparatus id appears in code
    Engine 1's hose reads NOT SET and is excluded from every sum until it is typed
    editing E7 from 1500 to 2500 flips the relay verdict from SHORT 800 to AVAILABLE,
      on the incident screen, with no reload
    the three snapshot fields in settings/apparatus are never displayed
    a sum containing an unknown is labelled a floor, not a total
    every setting shows an NFPA source or the words NO NFPA SOURCE
    an edited synthetic value reads EDITED, never verified
    Astra's hose facts are rebuilt from the edited settings, not cached

## THE DEMO BEAT

**Open settings. Change Engine 7 from 1,500 ft to 2,500 ft. Go back to the incident.**

The relay was SHORT by 800 feet and is now AVAILABLE on the first alarm. Nothing was reloaded and
nothing was hardcoded.

Then change it back, and say the true thing: the department corrected this number twice on the
morning of the build, and each correction changed the answer.
