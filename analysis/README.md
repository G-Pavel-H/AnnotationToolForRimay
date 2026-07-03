# Analysis

Offline analysis of the annotation export. **Read-only** — it does not touch the
app, API, or database; it just reads the CSV the admin **Export** produces.

## Pilot agreement (Fleiss' Kappa)

`pilot_agreement.py` measures inter-annotator agreement on the categorical
fields before running the main batch.

### Setup (once)

```bash
cd analysis
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Run

Export a phase from the app (Admin → Export → scope: Pilot), then:

```bash
python pilot_agreement.py --export rimay_export_pilot.csv --out pilot_report.md
```

It prints the slot summary table to stdout and writes the full markdown report
to `--out`. The same command works unchanged on the larger main batch — annotator
names and the requirement count are derived from the data, not hard-coded.

### What it reports

- **Fleiss' Kappa** for each of the five slots (`scope`, `condition`, `actor`,
  `modalVerb`, `action`), plus `overallIncomplete`, `conditionType`, `nonAtomic`.
  Chance-corrected: 3 categories (present/implied/missing) for slots, binary for
  the true/false fields.
- **Raw observed agreement** next to each Kappa — the proportion of requirements
  that were unanimous and ≥(n−1)-of-n (i.e. 3-of-4 with four annotators). This
  guards against misreading a low Kappa when one category dominates (the *Kappa
  paradox*).
- **Landis & Koch band** for each Kappa (poor → almost perfect), with a one-line
  flag on any field below *substantial* (< 0.61) as a candidate for refining that
  slot's definition in the annotation guide.
- **Disagreement worksheet** — every (requirement, field) where annotators split,
  with the vote distribution (e.g. `72-Signal condition: missing×3, present×1`).
  This is the agenda for the adjudication discussion.
- **Gold agreement** — if the export's `gold_*` columns are populated (i.e. you've
  adjudicated), each annotator's raw agreement with the gold standard per slot.
  Skipped silently when there's no gold yet.

Blank or unexpected values are warned and skipped (never crash); they're listed
in a *Data notes* section of the report.

## Conversion similarity

`conversion_similarity.py` measures how similar the annotators' free-text Rimay
conversions (`rimayText`) are — the counterpart to the categorical agreement
above, for the conversion text.

### Run

```bash
python conversion_similarity.py --export rimay_export_pilot.csv --out similarity_report.md
```

### What it reports

Three surface-form string metrics (0–1, higher = more similar):

- **chrF** — character n-gram F₂ (Popović 2015 style); robust for short text.
- **tokenJaccard** — token-set overlap (`<MISSING_*>` placeholders kept as tokens).
- **editSim** — 1 − normalized character edit distance.

Sections:

- **Inter-annotator similarity** — overall mean pairwise similarity, plus a
  per-annotator-pair chrF matrix (spots an annotator who consistently diverges).
- **Similarity to the adjudicated reference** — each annotator's conversion vs
  `canonicalRimay`, if that column is populated (skipped silently otherwise).
- **Per-requirement worksheet** — requirements sorted worst-first by mean chrF, so
  the biggest wording divergences surface for discussion.

Text is lowercased and whitespace-collapsed before comparison. These are
**surface** metrics (wording, not meaning) and are **not chance-corrected**, so a
low score flags divergence to inspect — two conversions can be equivalent in
meaning yet score low. Requirements with fewer than two conversions are excluded
from the pairwise comparison (noted in the report).

> This is deliberately dependency-light and reproducible. If you later want
> *semantic* similarity (embedding-based), that's an easy add-on — ask for it.

## Notes

- `requirements.txt` is intentionally minimal (`pandas`, `numpy`) — Fleiss' Kappa
  is implemented directly, so no `statsmodels` dependency is required.
- This covers only categorical agreement. Rimay conversion-text *similarity* is a
  separate later analysis, not included here.
