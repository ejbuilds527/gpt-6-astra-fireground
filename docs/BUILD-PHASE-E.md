# PHASE E · The 80 second clock, and three role-scoped surfaces

Two features. Both are owner rulings made 2026-09-10. Read `BUILD-NOW.md` first.

Everything below reads from Firestore, project `meerkatops-fireground`, database `(default)`.
Nothing here needs a new data source.

    settings/turnout             the window, the eight stages, their targets, the paint-order ruling
    settings/departments_auth    both WorkOS orgs, both logins, the cookie trap
    settings/staging             the five states, the bearings, the sentence Astra should say
    settings/staging_gap         what is NOT chosen, and the north/south split

---

## E.1 · The 80 second turnout clock

**NFPA 1710 gives 80 seconds of turnout time for fire suppression.** The tone drops. 80 seconds
later the rig is moving. Everything finished inside that window is read during turnout. Everything
finished later competes with the radio.

### Build

    a VISIBLE clock, started at the tone, counting to 80
    eight stage rows from settings/turnout.stages, each with its target and its REAL elapsed ms
    a stage that beats its target reads done. a stage that misses reads amber WITH its real time.
    rows sourced from precomputed data are LABELLED precomputed.

### The ruling that decides the architecture

**Run the code path first and paint it. Do not block the screen on the model.**

Stages 1, 2, 3, 4 and 8 are arithmetic over data already in Firestore. They owe nothing to Astra.
Stage 5 — Astra reading the imagery — is the one call with an unpredictable time and the one that
can fail.

So the screen fills from the top while stage 5 runs. Hydrants ranked, demand computed, tank
duration on the clock, mutual aid told where to stage. When Astra lands, the lay side and the
driveway path draw over what is already there.

**If the model times out, the screen still carries a usable answer and names the missing part.**

### Done when

    the clock is on screen and runs from the tone
    each of the eight stages shows its own measured elapsed time, not a target
    an overrun renders amber with its real number rather than being hidden
    the hydrant ranking is on screen BEFORE the Astra call returns
    killing the model call leaves a usable screen that says which part is missing

---

## E.2 · Three surfaces. Everyone sees only what they need.

**Owner's ruling: we are making the world smaller.** One incident, three accounts, three different
screens. Nobody scrolls past somebody else's job to find their own.

**The surface is chosen by the WorkOS ORGANISATION's `role_view` metadata, never by a user flag.**
Every member of a department responds from the same house and does the same job on this incident.
The role belongs to the organisation.

    role_view    org                              login                     password              display
    command      New Canaan Fire Company No. 1    command@fireground.xyz    command-fireground    New Canaan Command
    staging      Norwalk Fire Department          staging@fireground.xyz    staging-fireground    Norwalk Duty Officer
    shuttle      Wilton Fire Department           shuttle@fireground.xyz    shuttle-fireground    Wilton Tanker 1

**All three logins are proven.** Each authenticated against
`POST https://api.workos.com/user_management/authenticate` with `grant_type: password` at 18:10 EDT
on 2026-09-10, and each returned its own organisation id. **The password is the role name plus `-fireground`.** All three live in Secret Manager
`workos-demo-logins`. WorkOS refuses fewer than 10 characters and runs a common-password check,
which is why the bare role name was rejected.

Read the organisation with `getWorkOS().organizations.getOrganization(organizationId)` and switch on
`metadata.role_view`. Full records: Firestore `settings/departments_auth`.

### command — New Canaan. The only surface that DECIDES.

Everything in `BUILD-NOW.md`. The 80 second clock, the hydrant ranking, both supply options, the
staging board, the shuttle. **This is the only screen with a button that changes the incident.**

### staging — Norwalk. One question, answered.

Norwalk arrives **from the SSE at 4.99 miles**, and it is one of **five of the eight** mutual aid
companies converging from the south. That is the whole reason this screen exists.

    WHERE TO STAGE              the point, and the bearing REASON
    WHO ELSE IS ON MY APPROACH  the other four southern companies, named
    MY STATE                    responding · staged · called in · assigned · released
    THE HOLD                    DO NOT ENTER THE FIRE ROAD UNTIL COMMAND CALLS YOU IN

**No hydrants. No friction loss. No shuttle. No supply options.** A duty officer holding at a
staging point does not need the water math and must not have to read past it.

### shuttle — Wilton. The loop, and only the loop.

Wilton arrives **from the NE at 2.86 miles** and reaches the fill site without crossing the lay.
That is why Wilton is in the shuttle and Norwalk is not.

    THE ROUTE           drawn. outbound and return are ROUTED SEPARATELY and are not assumed equal.
    THE FILL SITE       which one, and its supply rate
    THE DUMP SITE       where, and who is nursing it — Tanker 8, which does NOT shuttle
    THE CYCLE           travel out · fill · travel back · dump · manoeuvre, each one stated
    MY POSITION         where this tanker is in the loop right now
    MY STATE            the same five states

**No staging board. No hydrant table.** A tanker driver needs the loop.

### The live link is the demo

Command writes. The other two subscribe. One Firestore listener each.

    Command taps "the Lodge"          all three surfaces recompute
    Command holds the south           Norwalk's screen shows the point and the hold
    Command calls Wilton to shuttle   Wilton's screen gains the route, fill site and dump site

**Three tabs side by side, and two change because the first one did.** That is the shot.

### Done when

    each login lands on its OWN surface, chosen from org metadata role_view
    the staging surface shows NO water math and NO shuttle
    the shuttle surface shows NO staging board
    the station, distance and arrival bearing on each are read from WorkOS org metadata
    an action on command appears on the other two with no reload
    the hold instruction is on the staging surface

---

## THE COOKIE RULING — one host, three cookie names

**This is settled and it needs no new domain.**

`fireground.meerkatops.app` maps **directly** to Cloud Run service `astra-fd`. Verified
2026-09-10, mapping status True. **Firebase Hosting is not in front of it**, so the rule that
Firebase forwards only `__session` does not apply here. The cookie name is ours to choose.

    the callback reads the org's role_view AFTER the token exchange
    it sets   fg_command   |   fg_staging   |   fg_shuttle
    each surface reads ONLY its own cookie

Three tabs in one browser. All three signed in at once. None evicts another.

### The two alternatives, and why they are not the answer

    two browser profiles     works today and needs no code. THREE profiles on a recording is
                             clumsy and one mis-click shows the wrong screen.
    three hostnames          the most realistic, and how a real mutual aid portal would work.
                             each needs a Cloud Run domain mapping AND a Google-managed
                             certificate. A certificate is not instant.
                             DO NOT PUT A CERTIFICATE ON THE CRITICAL PATH TO A 15:30 RECORDING.

---

## What is NOT settled, and do not invent it

    the staging POINT coordinates are not chosen. Two are needed, one north and one south.
      Ask the owner. Until then render the staging point as NOT SET and show the bearing group.
    the position in the shuttle cycle is not modelled. queue time at the fill site is not modelled.
    every tanker capacity is SYNTHETIC. It is flagged synthetic in Firestore and in WorkOS
      metadata. Render the flag.
