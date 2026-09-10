# Fireground

**Incident response grounding for fire departments.** Built at the OpenAI GPT-6 Astra Hackathon,
2026-09-10.

When a department is dispatched to a structure fire, the first thing that decides everything else
is *where they are coming from*. Apparatus from the home station approaches on one heading. A
mutual-aid company from the next town approaches on another. That single fact drives the shuttle
loop, the fill-site ranking and the turnaround penalty.

Fireground puts the station on the **organisation**, not the user, because every member of a
department responds from the same house. Sign in, and the app already knows your station, your
apparatus and your direction of approach.

    Responding NNE (23°), 2.1 mi
    from 60 Main St, New Canaan, CT 06840 to Structure fire, Silvermine Rd

**Bearing and distance are computed in code. They are never estimated by a model.** A model that
guesses a heading to one significant figure is worse than no heading, because it looks right.

## What is built

- WorkOS AuthKit sign-in, with organisation metadata carrying `hq_address`, `hq_lat`, `hq_lon`,
  `station_id` and `apparatus`
- A protected `/app` route that reads the signed-in user's organisation and renders the station,
  the apparatus and the computed approach
- Two seeded departments, so mutual aid is demonstrable rather than described: a home company and
  a neighbouring one with `mutual_aid: true`
- Honest absence: if `hq_lat` or `hq_lon` is missing, the panel is hidden and the address row reads
  `NOT SET — the approach direction cannot be computed`, so a missing station is visible rather
  than silently wrong

## Stack

    Next.js 16 (App Router)      the application
    WorkOS AuthKit               authentication and organisation metadata
    Google Cloud Run             hosting, us-east1
    Workload Identity Federation CI to GCP, with no service account key

## Two things we measured the hard way

**Firebase Hosting cannot front an auth flow.** It forwards exactly one cookie to a backend,
`__session`, and strips every other. AuthKit needs two: the session cookie and a PKCE cookie.
Behind Firebase, the callback fails with `missing_pkce_cookie` every time. The static landing page
can live there. The authenticated app cannot.

**The redirect URI must be passed explicitly to the AuthKit middleware.** The middleware runs in
Next's edge runtime, which does not see variables set on the Cloud Run service at runtime — an edge
bundle only carries what was inlined at build time. Reading it from `process.env` produced
`You must provide a redirect URI in the AuthKit middleware or in the environment` and every route
returned 500.

Both are recorded in the source, beside the code they explain.

## Running it

```bash
npm install
npm run dev
```

Set these in `.env.local`:

```
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_COOKIE_PASSWORD=      # 32+ characters
WORKOS_REDIRECT_URI=http://localhost:3000/callback
```

The redirect URI must also be registered in the WorkOS dashboard, and it must match exactly.
`middleware.ts` carries the deployed value explicitly for the reason given above — change it there
when you change hosts.

## CI

`.github/workflows/deploy.yml` authenticates to GCP with Workload Identity Federation.
**There is no service account key in this repository and there must never be one.** The
organisation disables key creation by policy.

## License

Apache License 2.0. See [LICENSE](LICENSE).
