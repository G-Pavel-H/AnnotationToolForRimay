# Experiment 01 — Pilot agreement & similarity

Analysis run on the **pilot** export from the annotation tool.

| | |
|---|---|
| **Phase** | pilot |
| **Requirements** | 10 |
| **Annotators** | 4 — admin, Arthur, Mko, Rafo (each annotated all 10) |
| **Gold standard** | none (not adjudicated — gold sections skipped) |
| **Date run** | 2026-07-03 |
| **Data** | [`rimay_export_pilot.csv`](./rimay_export_pilot.csv) (exported from the app) |

## Files

- [`rimay_export_pilot.csv`](./rimay_export_pilot.csv) — the raw export analysed (kept here so the experiment is self-contained/reproducible).
- [`agreement_report.md`](./agreement_report.md) — Fleiss' Kappa + raw agreement + disagreement worksheet.
- [`similarity_report.md`](./similarity_report.md) — conversion-text similarity (chrF / tokenJaccard / editSim).

## How to reproduce

From the repo root, with the analysis venv active (see [`../../README.md`](../../README.md)):

```bash
python analysis/pilot_agreement.py \
  --export analysis/experiments/exp01_pilot/rimay_export_pilot.csv \
  --out    analysis/experiments/exp01_pilot/agreement_report.md

python analysis/conversion_similarity.py \
  --export analysis/experiments/exp01_pilot/rimay_export_pilot.csv \
  --out    analysis/experiments/exp01_pilot/similarity_report.md
```

## Headline results

### Categorical agreement (Fleiss' Kappa)

| Slot | Kappa | Band | Unanimous | ≥3-of-4 |
|------|------:|------|----------:|--------:|
| scope | −0.088 | poor | 60% | 100% |
| condition | 0.387 | fair | 40% | 90% |
| actor | 0.379 | fair | 60% | 90% |
| modalVerb | 0.074 | slight | 70% | 90% |
| action | −0.026 | poor | 90% | 100% |

Other fields: `overallIncomplete` and `nonAtomic` — **Kappa undefined** because every
annotation was the same value (all *complete*, all *atomic*), so there is no
variation to chance-correct. `conditionType` — Kappa 0.200 (fair).

### Conversion similarity (surface-form, mean over requirements)

| Metric | Mean |
|--------|-----:|
| chrF | 0.563 |
| tokenJaccard | 0.462 |
| editSim | 0.423 |

Most divergent conversions: **1699-Signal** and **778-Signal** (both multi-action
requirements where annotators split one vs two system responses). Most consistent:
**72-Signal**, **4049-Signal**.

## Reading the numbers (factual notes, not conclusions)

- **The Kappa paradox is in play on the near-constant slots.** `scope`, `modalVerb`
  and `action` scored low/negative Kappa while raw agreement was high (e.g. `action`
  90% unanimous, Kappa −0.026). This is expected: those slots were dominated by a
  single category (actions almost always *present*, modal verbs almost always
  *implied*, per the guide's own tips), which drives expected-agreement toward 1 and
  makes Kappa uninformative. Read raw agreement for these, not Kappa.
- **`condition` / `conditionType` are the genuinely contested fields.** They show
  fair Kappa *and* real splits in the disagreement worksheet (whether a requirement
  has a trigger/precondition vs none). This is the substantive item for guide
  refinement / adjudication discussion, not the near-constant slots.
- **`overallIncomplete` had no variation** (all 40 annotations = complete), so there
  is nothing to measure on it in this pilot.
- The report flags every slot below the *substantial* (0.61) band automatically;
  here that is all of them, but per the point above, most of that is category
  imbalance rather than definitional disagreement.
- The analysis includes all 40 annotations as exported (39 submitted + 1 draft —
  Mko on `3192-Signal`); status is not filtered.

These are surface/categorical statistics only. No semantic-similarity or gold
comparison was run (no adjudication in this pilot).
