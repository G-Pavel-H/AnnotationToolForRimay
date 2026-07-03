#!/usr/bin/env python3
"""
Pilot inter-annotator agreement analysis for the Rimay annotation tool.

Reads the app's per-(requirement, annotator) export CSV and computes Fleiss'
Kappa (chance-corrected agreement) for each categorical field, alongside raw
observed agreement, a disagreement worksheet, and (if a gold standard is
present) each annotator's agreement with gold.

Usage:
    python analysis/pilot_agreement.py --export rimay_export_pilot.csv \
        --out analysis/pilot_report.md

This is offline analysis. It does not touch the app, API, or database, and it
derives annotators / requirement counts from the data (so it works unchanged on
the larger main batch).
"""

import argparse
import sys
from collections import Counter

import numpy as np
import pandas as pd


# --- Field definitions ------------------------------------------------------
# Each entry: report label -> (csv column, set of allowed lowercase categories).
SLOT_FIELDS = {
    "scope": ("slot_scope", {"present", "implied", "missing"}),
    "condition": ("slot_condition", {"present", "implied", "missing"}),
    "actor": ("slot_actor", {"present", "implied", "missing"}),
    "modalVerb": ("slot_modalVerb", {"present", "implied", "missing"}),
    "action": ("slot_action", {"present", "implied", "missing"}),
}

EXTRA_FIELDS = {
    "overallIncomplete": ("overallIncomplete", {"true", "false"}),
    "conditionType": ("conditionType", {"precondition", "trigger", "temporal", "none"}),
    "nonAtomic": ("nonAtomic", {"true", "false"}),
}

GOLD_COLUMNS = {
    "scope": "gold_scope",
    "condition": "gold_condition",
    "actor": "gold_actor",
    "modalVerb": "gold_modalVerb",
    "action": "gold_action",
}

SUBJECT_COL = "reqId"
RATER_COL = "annotatorUsername"

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)
    print(f"WARNING: {msg}", file=sys.stderr)


# --- Fleiss' Kappa ----------------------------------------------------------
def fleiss_kappa(rating_counts):
    """
    Compute Fleiss' Kappa from a subject x category count matrix.

    rating_counts: 2D array, shape (n_subjects, n_categories), where entry
    [i, j] is the number of raters who assigned subject i to category j.

    Tolerates a variable number of raters per subject (subjects with < 2
    ratings are dropped, with the standard generalization of the per-subject
    agreement term). Returns float kappa, or NaN if it is undefined (e.g. only
    one category ever used, so expected agreement == 1).
    """
    counts = np.asarray(rating_counts, dtype=float)
    n_i = counts.sum(axis=1)  # ratings per subject

    keep = n_i >= 2
    if not keep.any():
        return float("nan")
    counts = counts[keep]
    n_i = n_i[keep]

    # Category proportions p_j across all ratings.
    total = n_i.sum()
    p_j = counts.sum(axis=0) / total

    # Per-subject observed agreement P_i.
    # P_i = (sum_j n_ij^2 - n_i) / (n_i * (n_i - 1))
    p_i = (np.square(counts).sum(axis=1) - n_i) / (n_i * (n_i - 1))
    p_bar = p_i.mean()

    p_e = np.square(p_j).sum()
    denom = 1.0 - p_e
    if denom <= 1e-12:
        # No expected variation (a single category dominates completely).
        return float("nan")
    return (p_bar - p_e) / denom


def landis_koch(kappa):
    """Return the Landis & Koch interpretation band for a kappa value."""
    if kappa is None or (isinstance(kappa, float) and np.isnan(kappa)):
        return "undefined (no category variation)"
    if kappa < 0:
        return "poor"
    if kappa <= 0.20:
        return "slight"
    if kappa <= 0.40:
        return "fair"
    if kappa <= 0.60:
        return "moderate"
    if kappa <= 0.80:
        return "substantial"
    return "almost perfect"


# --- Building per-subject rating vectors ------------------------------------
def collect_ratings(df, column, allowed, field_label):
    """
    Group the dataframe by subject and return, per subject, a normalized list of
    (rater, category) ratings restricted to `allowed`. Blank/unexpected values
    are warned and skipped.

    Returns: dict subject -> list[(rater, category)]
    """
    if column not in df.columns:
        warn(f"column '{column}' for field '{field_label}' not found; skipping field")
        return {}

    per_subject = {}
    for _, row in df.iterrows():
        subject = row[SUBJECT_COL]
        rater = row[RATER_COL]
        raw = row[column]
        value = str(raw).strip().lower()
        if value == "" or value == "nan":
            warn(f"blank '{field_label}' for {subject} / {rater}; skipping this rating")
            continue
        if value not in allowed:
            warn(
                f"unexpected '{field_label}' value '{raw}' for {subject} / {rater}; skipping this rating"
            )
            continue
        per_subject.setdefault(subject, []).append((rater, value))
    return per_subject


def count_matrix(per_subject, categories):
    """Build a subject x category count matrix (ordered by `categories`)."""
    cat_index = {c: i for i, c in enumerate(categories)}
    subjects = sorted(per_subject.keys())
    matrix = np.zeros((len(subjects), len(categories)), dtype=float)
    for si, subj in enumerate(subjects):
        for _, value in per_subject[subj]:
            matrix[si, cat_index[value]] += 1
    return subjects, matrix


def agreement_stats(per_subject):
    """
    Raw observed agreement across subjects:
      - unanimous: all raters on a subject chose the same category
      - majority (>= n-1 of n): all but at most one agreed
    Computed only over subjects with >= 2 ratings. Returns (unanimous_frac,
    majority_frac, n_subjects_used).
    """
    unanimous = 0
    majority = 0
    used = 0
    for subj, ratings in per_subject.items():
        n = len(ratings)
        if n < 2:
            continue
        used += 1
        counts = Counter(v for _, v in ratings)
        top = max(counts.values())
        if top == n:
            unanimous += 1
        if top >= n - 1:
            majority += 1
    if used == 0:
        return float("nan"), float("nan"), 0
    return unanimous / used, majority / used, used


def analyze_field(df, field_label, column, allowed):
    """Full analysis for one field: kappa, bands, raw agreement, distributions."""
    categories = sorted(allowed)
    per_subject = collect_ratings(df, column, allowed, field_label)
    if not per_subject:
        return None
    _, matrix = count_matrix(per_subject, categories)
    kappa = fleiss_kappa(matrix)
    unan, maj, used = agreement_stats(per_subject)
    return {
        "field": field_label,
        "kappa": kappa,
        "band": landis_koch(kappa),
        "unanimous": unan,
        "majority": maj,
        "n_subjects": used,
        "per_subject": per_subject,
    }


# --- Disagreement worksheet -------------------------------------------------
def disagreement_rows(results):
    """
    Every (subject, field) where raters split, with the vote distribution.
    Returns a list of dicts sorted by subject then field.
    """
    rows = []
    for res in results:
        if res is None:
            continue
        field = res["field"]
        for subject, ratings in res["per_subject"].items():
            counts = Counter(v for _, v in ratings)
            if len(counts) <= 1:
                continue  # unanimous (or single rating)
            dist = ", ".join(
                f"{cat}×{n}" for cat, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
            )
            rows.append({"reqId": subject, "field": field, "distribution": dist})
    rows.sort(key=lambda r: (str(r["reqId"]), r["field"]))
    return rows


# --- Gold-standard agreement ------------------------------------------------
def gold_agreement(df):
    """
    If gold_* columns are populated, compute each annotator's raw agreement with
    the gold value per slot (proportion over requirements that have a gold value
    for that slot). Returns (table_dict, raters, slots_with_gold) or None.
    """
    present_gold_cols = [c for c in GOLD_COLUMNS.values() if c in df.columns]
    if not present_gold_cols:
        return None

    # gold is defined once per requirement; take the first row per requirement.
    gold_by_req = {}
    for subject, grp in df.groupby(SUBJECT_COL):
        first = grp.iloc[0]
        gold_by_req[subject] = {
            slot: str(first.get(col, "")).strip().lower()
            for slot, col in GOLD_COLUMNS.items()
            if col in df.columns
        }

    raters = sorted(df[RATER_COL].dropna().unique())
    # slots that actually have at least one valid gold value
    slots_with_gold = []
    for slot, (column, allowed) in SLOT_FIELDS.items():
        if GOLD_COLUMNS.get(slot) not in df.columns:
            continue
        has_valid = any(gold_by_req[s].get(slot) in allowed for s in gold_by_req)
        if has_valid:
            slots_with_gold.append(slot)

    if not slots_with_gold:
        return None

    # table[rater][slot] = (matches, comparable)
    table = {r: {s: [0, 0] for s in slots_with_gold} for r in raters}
    for _, row in df.iterrows():
        subject = row[SUBJECT_COL]
        rater = row[RATER_COL]
        golds = gold_by_req.get(subject, {})
        for slot in slots_with_gold:
            column, allowed = SLOT_FIELDS[slot]
            gval = golds.get(slot)
            if gval not in allowed:
                continue  # no gold for this slot on this requirement
            aval = str(row.get(column, "")).strip().lower()
            if aval not in allowed:
                continue
            table[rater][slot][1] += 1
            if aval == gval:
                table[rater][slot][0] += 1
    return table, raters, slots_with_gold


# --- Report rendering -------------------------------------------------------
def fmt_kappa(k):
    if k is None or (isinstance(k, float) and np.isnan(k)):
        return "n/a"
    return f"{k:.3f}"


def fmt_pct(x):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "n/a"
    return f"{100 * x:.0f}%"


def build_report(df, slot_results, extra_results, disagreements, gold, meta):
    lines = []
    L = lines.append

    L("# Pilot inter-annotator agreement report")
    L("")
    L(f"- Export: `{meta['export']}`")
    L(f"- Requirements: **{meta['n_requirements']}**")
    L(f"- Annotators ({len(meta['annotators'])}): {', '.join(meta['annotators'])}")
    if meta["phases"]:
        L(f"- Phase(s): {', '.join(meta['phases'])}")
    L("")
    L("Fleiss' Kappa is chance-corrected agreement. Raw agreement is shown next "
      "to it because Kappa can read low when one category dominates (the *Kappa "
      "paradox*) — read the two together.")
    L("")

    # --- Per-slot summary table ---
    L("## Slot agreement summary")
    L("")
    L("| Slot | Fleiss' Kappa | Band | Unanimous | ≥(n−1)-of-n |")
    L("|------|--------------:|------|----------:|------------:|")
    for res in slot_results:
        if res is None:
            continue
        L(
            f"| {res['field']} | {fmt_kappa(res['kappa'])} | {res['band']} | "
            f"{fmt_pct(res['unanimous'])} | {fmt_pct(res['majority'])} |"
        )
    L("")
    L("*Unanimous = all raters agreed on a requirement. ≥(n−1)-of-n = all but at "
      "most one agreed (i.e. 3-of-4 with four annotators).*")
    L("")

    # below-substantial flags
    flagged = [
        res["field"]
        for res in slot_results
        if res is not None
        and not (isinstance(res["kappa"], float) and np.isnan(res["kappa"]))
        and res["kappa"] < 0.61
    ]
    if flagged:
        L("### Slots below 'substantial' (< 0.61)")
        L("")
        for f in flagged:
            L(f"- **{f}** — Kappa below substantial; candidate for refining this "
              f"slot's definition in the annotation guide.")
        L("")

    # --- Other fields ---
    L("## Other categorical fields")
    L("")
    L("| Field | Fleiss' Kappa | Band | Unanimous | ≥(n−1)-of-n | Note |")
    L("|-------|--------------:|------|----------:|------------:|------|")
    notes = {
        "overallIncomplete": "binary (true/false)",
        "conditionType": "only meaningful where a condition exists; computed over all rows",
        "nonAtomic": "binary (true/false)",
    }
    for res in extra_results:
        if res is None:
            continue
        L(
            f"| {res['field']} | {fmt_kappa(res['kappa'])} | {res['band']} | "
            f"{fmt_pct(res['unanimous'])} | {fmt_pct(res['majority'])} | {notes.get(res['field'], '')} |"
        )
    L("")
    extra_flagged = [
        res["field"]
        for res in extra_results
        if res is not None
        and not (isinstance(res["kappa"], float) and np.isnan(res["kappa"]))
        and res["kappa"] < 0.61
    ]
    for f in extra_flagged:
        L(f"- Note: **{f}** Kappa below substantial (< 0.61); candidate for guide refinement.")
    if extra_flagged:
        L("")

    # --- Gold agreement ---
    if gold is not None:
        table, raters, slots = gold
        L("## Agreement with the adjudicated gold standard")
        L("")
        L("Raw proportion of each annotator's slot values that match the gold "
          "standard, over requirements that have a gold value for that slot.")
        L("")
        header = "| Annotator | " + " | ".join(slots) + " |"
        sep = "|-----------|" + "|".join(["------:"] * len(slots)) + "|"
        L(header)
        L(sep)
        for r in raters:
            cells = []
            for s in slots:
                matches, comparable = table[r][s]
                cells.append(f"{fmt_pct(matches / comparable) if comparable else 'n/a'}")
            L(f"| {r} | " + " | ".join(cells) + " |")
        L("")

    # --- Disagreement worksheet ---
    L("## Disagreement worksheet")
    L("")
    if not disagreements:
        L("No disagreements — every rating was unanimous. 🎉")
    else:
        L(f"{len(disagreements)} (requirement, field) cells where annotators split. "
          "Use this as the agenda for the adjudication discussion.")
        L("")
        L("| Requirement | Field | Vote distribution |")
        L("|-------------|-------|-------------------|")
        for row in disagreements:
            L(f"| {row['reqId']} | {row['field']} | {row['distribution']} |")
    L("")

    # --- Data notes ---
    if WARNINGS:
        L("## Data notes")
        L("")
        L(f"{len(WARNINGS)} rating(s) were skipped (blank or unexpected values):")
        L("")
        # De-duplicate while preserving order, cap the list.
        seen = []
        for w in WARNINGS:
            if w not in seen:
                seen.append(w)
        for w in seen[:50]:
            L(f"- {w}")
        if len(seen) > 50:
            L(f"- … and {len(seen) - 50} more.")
        L("")

    return "\n".join(lines)


def print_summary_stdout(slot_results):
    """Print the per-slot summary table to stdout."""
    print("\nSlot agreement summary")
    print(f"{'slot':<18}{'kappa':>8}  {'band':<26}{'unanim':>8}{'≥n-1/n':>9}")
    print("-" * 71)
    for res in slot_results:
        if res is None:
            continue
        print(
            f"{res['field']:<18}{fmt_kappa(res['kappa']):>8}  {res['band']:<26}"
            f"{fmt_pct(res['unanimous']):>8}{fmt_pct(res['majority']):>9}"
        )
    print()


def main():
    parser = argparse.ArgumentParser(description="Pilot inter-annotator agreement (Fleiss' Kappa).")
    parser.add_argument("--export", required=True, help="Path to the export CSV (per requirement×annotator).")
    parser.add_argument("--out", required=True, help="Path to write the markdown report.")
    args = parser.parse_args()

    # Read everything as strings, blanks preserved as "" (not NaN).
    try:
        df = pd.read_csv(args.export, dtype=str, keep_default_na=False)
    except FileNotFoundError:
        print(f"ERROR: export file not found: {args.export}", file=sys.stderr)
        sys.exit(1)

    for required in (SUBJECT_COL, RATER_COL):
        if required not in df.columns:
            print(f"ERROR: required column '{required}' missing from export.", file=sys.stderr)
            sys.exit(1)

    # Drop rows with no annotator (requirements that were never annotated show up
    # as a single blank-annotator row in the export).
    df = df[df[RATER_COL].astype(str).str.strip() != ""].copy()
    if df.empty:
        print("ERROR: no annotated rows found in the export.", file=sys.stderr)
        sys.exit(1)

    annotators = sorted(df[RATER_COL].unique())
    requirements = sorted(df[SUBJECT_COL].unique())
    phases = sorted(df["phase"].unique()) if "phase" in df.columns else []

    # Sanity check: warn on uneven ratings per requirement.
    per_req_counts = df.groupby(SUBJECT_COL)[RATER_COL].nunique()
    uneven = per_req_counts[per_req_counts != per_req_counts.max()]
    for subj, c in uneven.items():
        warn(f"requirement {subj} has {c} annotators (expected {per_req_counts.max()})")

    slot_results = [analyze_field(df, label, col, allowed) for label, (col, allowed) in SLOT_FIELDS.items()]
    extra_results = [analyze_field(df, label, col, allowed) for label, (col, allowed) in EXTRA_FIELDS.items()]
    disagreements = disagreement_rows(slot_results + extra_results)
    gold = gold_agreement(df)

    meta = {
        "export": args.export,
        "n_requirements": len(requirements),
        "annotators": annotators,
        "phases": phases,
    }

    report = build_report(df, slot_results, extra_results, disagreements, gold, meta)

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(report)

    print_summary_stdout(slot_results)
    print(f"Wrote report to {args.out}")
    if gold is None:
        print("(No populated gold_* columns found — gold-agreement section skipped.)")
    if WARNINGS:
        print(f"({len(WARNINGS)} rating(s) skipped — see the 'Data notes' section of the report.)")


if __name__ == "__main__":
    main()
