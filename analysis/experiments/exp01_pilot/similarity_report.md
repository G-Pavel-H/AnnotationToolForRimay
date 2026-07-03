# Rimay conversion similarity report

- Export: `analysis/experiments/exp01_pilot/rimay_export_pilot.csv`
- Requirements with conversions: **10**
- Annotators (4): Arthur, Mko, Rafo, admin
- Phase(s): pilot

Surface-form string similarity (0–1, higher = more similar). **chrF** = character n-gram F₂; **tokenJaccard** = token-set overlap; **editSim** = 1 − normalized character edit distance. These measure wording, not meaning, and are not chance-corrected — a low score flags surface divergence to inspect, not necessarily a real disagreement.

## Inter-annotator similarity (overall)

Mean pairwise similarity across annotators, averaged over requirements.

| Metric | Mean |
|--------|-----:|
| chrF | 0.563 |
| tokenJaccard | 0.462 |
| editSim | 0.423 |

## Annotator-pair mean chrF

Mean chrF between each pair of annotators (over requirements where both wrote a conversion). Spots an annotator whose conversions consistently diverge from the others.

| Pair | Mean chrF | Requirements |
|------|----------:|-------------:|
| Arthur ↔ Mko | 0.606 | 10 |
| Arthur ↔ Rafo | 0.547 | 10 |
| Arthur ↔ admin | 0.512 | 10 |
| Mko ↔ Rafo | 0.574 | 10 |
| Mko ↔ admin | 0.516 | 10 |
| Rafo ↔ admin | 0.623 | 10 |

## Per-requirement similarity (lowest agreement first)

Requirements sorted by mean pairwise chrF ascending — the top rows are where annotators' conversions diverged most.

| Requirement | #conv | chrF | tokenJaccard | editSim |
|-------------|------:|-----:|-------------:|--------:|
| 1699-Signal | 4 | 0.459 | 0.384 | 0.350 |
| 778-Signal | 4 | 0.477 | 0.295 | 0.365 |
| 2159-Signal | 4 | 0.499 | 0.401 | 0.403 |
| 751-Signal | 4 | 0.511 | 0.391 | 0.333 |
| 5874-Signal | 4 | 0.545 | 0.408 | 0.500 |
| 36-Mastodon | 4 | 0.565 | 0.504 | 0.360 |
| 152-Mastodon | 4 | 0.572 | 0.489 | 0.388 |
| 3192-Signal | 4 | 0.662 | 0.508 | 0.448 |
| 4049-Signal | 4 | 0.666 | 0.579 | 0.565 |
| 72-Signal | 4 | 0.675 | 0.664 | 0.514 |
