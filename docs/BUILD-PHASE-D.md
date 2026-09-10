# Phase D · one screen, deployed          target 15:15 – 16:15

## The screen

One page. The synthetic dispatch goes in. Results reveal in order, and each stage shows its own
state — running, done, failed, or not run.

    1  dispatch          the incident, visibly labelled SYNTHETIC
    2  site              the lay proposal and which side, from Astra
    3  water math        demand, tank duration, required delivery rate
    4  source            the three candidates, the choice, and why
    5  validation        satisfied / unmet / ungraded, with the failed checks named
    6  report            what the incident commander acts on

## What must be visible on the screen itself

    the coefficient and assumptions beside every number
    which lines are COMPUTED and which are the MODEL'S JUDGEMENT
    "demonstration decision support — not verified operational guidance"
    "training mode"
    every synthetic value labelled synthetic
    stage timings
    ROUTING NOT AVAILABLE, and that shuttle results are therefore ungraded

## Failure states are part of the build

A missing stage must not silently look complete. Loading and failure states are visible. A model
timeout shows as a model timeout, and the measured numbers still render — an outage must never
take the arithmetic down with it.

## Deployment — Claude handles this half

    push to main -> Cloud Build -> Cloud Run, already green
    https://fireground.meerkatops.app, certificate live
    secrets mounted from Secret Manager, none in the repo or the browser

Codex builds the screen. Claude deploys it and confirms the deployed process reaches every
dependency.

## Done when

The complete scenario runs through `https://fireground.meerkatops.app` — the same URL used for the
recording — and every limitation is visible on the screen.
