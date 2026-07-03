# Pilot inter-annotator agreement report

- Export: `analysis/experiments/exp01_pilot/rimay_export_pilot.csv`
- Requirements: **10**
- Annotators (4): Arthur, Mko, Rafo, admin
- Phase(s): pilot

Fleiss' Kappa is chance-corrected agreement. Raw agreement is shown next to it because Kappa can read low when one category dominates (the *Kappa paradox*) — read the two together.

## Slot agreement summary

| Slot | Fleiss' Kappa | Band | Unanimous | ≥(n−1)-of-n |
|------|--------------:|------|----------:|------------:|
| scope | -0.088 | poor | 60% | 100% |
| condition | 0.387 | fair | 40% | 90% |
| actor | 0.379 | fair | 60% | 90% |
| modalVerb | 0.074 | slight | 70% | 90% |
| action | -0.026 | poor | 90% | 100% |

*Unanimous = all raters agreed on a requirement. ≥(n−1)-of-n = all but at most one agreed (i.e. 3-of-4 with four annotators).*

### Slots below 'substantial' (< 0.61)

- **scope** — Kappa below substantial; candidate for refining this slot's definition in the annotation guide.
- **condition** — Kappa below substantial; candidate for refining this slot's definition in the annotation guide.
- **actor** — Kappa below substantial; candidate for refining this slot's definition in the annotation guide.
- **modalVerb** — Kappa below substantial; candidate for refining this slot's definition in the annotation guide.
- **action** — Kappa below substantial; candidate for refining this slot's definition in the annotation guide.

## Other categorical fields

| Field | Fleiss' Kappa | Band | Unanimous | ≥(n−1)-of-n | Note |
|-------|--------------:|------|----------:|------------:|------|
| overallIncomplete | n/a | undefined (no category variation) | 100% | 100% | binary (true/false) |
| conditionType | 0.200 | fair | 40% | 80% | only meaningful where a condition exists; computed over all rows |
| nonAtomic | n/a | undefined (no category variation) | 100% | 100% | binary (true/false) |

- Note: **conditionType** Kappa below substantial (< 0.61); candidate for guide refinement.

## Disagreement worksheet

24 (requirement, field) cells where annotators split. Use this as the agenda for the adjudication discussion.

| Requirement | Field | Vote distribution |
|-------------|-------|-------------------|
| 152-Mastodon | action | present×3, implied×1 |
| 152-Mastodon | actor | present×3, implied×1 |
| 1699-Signal | actor | implied×2, present×2 |
| 1699-Signal | condition | missing×3, present×1 |
| 1699-Signal | conditionType | none×3, trigger×1 |
| 1699-Signal | scope | implied×3, missing×1 |
| 2159-Signal | actor | implied×3, present×1 |
| 2159-Signal | condition | missing×2, present×2 |
| 2159-Signal | conditionType | none×3, trigger×1 |
| 2159-Signal | scope | implied×3, missing×1 |
| 3192-Signal | condition | missing×3, present×1 |
| 36-Mastodon | actor | present×3, implied×1 |
| 36-Mastodon | scope | implied×3, present×1 |
| 4049-Signal | condition | present×3, missing×1 |
| 4049-Signal | conditionType | precondition×3, none×1 |
| 4049-Signal | modalVerb | implied×3, present×1 |
| 4049-Signal | scope | implied×3, missing×1 |
| 5874-Signal | condition | present×3, implied×1 |
| 5874-Signal | conditionType | none×2, trigger×2 |
| 5874-Signal | modalVerb | implied×2, present×2 |
| 751-Signal | condition | present×3, missing×1 |
| 751-Signal | conditionType | none×3, trigger×1 |
| 778-Signal | conditionType | trigger×2, none×1, temporal×1 |
| 778-Signal | modalVerb | implied×3, present×1 |
