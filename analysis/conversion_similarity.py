#!/usr/bin/env python3
"""
Rimay conversion-text similarity analysis for the annotation tool.

Measures how similar the annotators' free-text Rimay conversions (`rimayText`)
are to each other, and — where an adjudicated reference (`canonicalRimay`) exists
— how close each annotator is to that gold conversion.

Usage:
    python analysis/conversion_similarity.py --export rimay_export_pilot.csv \
        --out analysis/similarity_report.md

These are surface-form string metrics (higher = more similar, range 0–1). They
are NOT chance-corrected and do not measure meaning: two conversions can be
semantically equivalent yet score low if their wording differs. Read low scores
as "surface divergence worth inspecting", not automatically as disagreement.

Offline analysis only — it does not touch the app, API, or database, and derives
annotators / requirement counts from the data (so it works on the main batch too).
"""

import argparse
import re
import sys
from collections import Counter
from itertools import combinations

import numpy as np
import pandas as pd

SUBJECT_COL = "reqId"
RATER_COL = "annotatorUsername"
TEXT_COL = "rimayText"
GOLD_COL = "canonicalRimay"

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)
    print(f"WARNING: {msg}", file=sys.stderr)


# --- Text normalisation & tokenisation --------------------------------------
def normalize(text):
    """Lowercase and collapse whitespace. Placeholders like <MISSING_ACTOR> are
    preserved (lowercased)."""
    if text is None:
        return ""
    s = str(text).strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


_TOKEN_RE = re.compile(r"<[a-z_]+>|[a-z0-9]+")


def tokenize(norm_text):
    """Tokens = <placeholder> tags plus alphanumeric words (punctuation/quotes
    dropped)."""
    return _TOKEN_RE.findall(norm_text)


# --- Similarity metrics (all return 0..1) -----------------------------------
def levenshtein(a, b):
    """Character-level edit distance."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def edit_similarity(a, b):
    """1 - normalized edit distance over characters."""
    if not a and not b:
        return 1.0
    m = max(len(a), len(b))
    if m == 0:
        return 1.0
    return 1.0 - levenshtein(a, b) / m


def token_jaccard(ta, tb):
    """Jaccard over token sets."""
    sa, sb = set(ta), set(tb)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _char_ngrams(s, n):
    return [s[i : i + n] for i in range(len(s) - n + 1)] if len(s) >= n else []


def _chrf_directional(hyp, ref, n_max=6, beta=2.0):
    """chrF (Popović 2015): F_beta over character n-grams n=1..n_max."""
    precisions, recalls = [], []
    for n in range(1, n_max + 1):
        hyp_ng = Counter(_char_ngrams(hyp, n))
        ref_ng = Counter(_char_ngrams(ref, n))
        hyp_total = sum(hyp_ng.values())
        ref_total = sum(ref_ng.values())
        matches = sum((hyp_ng & ref_ng).values())
        if hyp_total > 0:
            precisions.append(matches / hyp_total)
        if ref_total > 0:
            recalls.append(matches / ref_total)
    if not precisions or not recalls:
        return 0.0
    p = sum(precisions) / len(precisions)
    r = sum(recalls) / len(recalls)
    if p == 0 and r == 0:
        return 0.0
    b2 = beta * beta
    denom = b2 * p + r
    return (1 + b2) * p * r / denom if denom > 0 else 0.0


def chrf(a, b):
    """Symmetric chrF for pairwise use (mean of both directions)."""
    return (_chrf_directional(a, b) + _chrf_directional(b, a)) / 2.0


METRICS = {
    "chrF": lambda na, nb, ta, tb: chrf(na, nb),
    "tokenJaccard": lambda na, nb, ta, tb: token_jaccard(ta, tb),
    "editSim": lambda na, nb, ta, tb: edit_similarity(na, nb),
}
METRIC_ORDER = ["chrF", "tokenJaccard", "editSim"]


def all_metrics(na, nb, ta, tb):
    return {name: fn(na, nb, ta, tb) for name, fn in METRICS.items()}


# --- Core analysis ----------------------------------------------------------
def build_conversions(df):
    """
    subject -> { rater -> {'norm':..., 'tokens':...} } for NON-EMPTY conversions,
    plus subject -> normalized gold (or None).
    """
    conversions = {}
    golds = {}
    for subject, grp in df.groupby(SUBJECT_COL):
        per_rater = {}
        for _, row in grp.iterrows():
            rater = row[RATER_COL]
            norm = normalize(row.get(TEXT_COL, ""))
            if norm == "":
                continue  # annotator wrote no conversion for this requirement
            per_rater[rater] = {"norm": norm, "tokens": tokenize(norm)}
        if per_rater:
            conversions[subject] = per_rater
        # gold (defined once per requirement)
        gold_raw = normalize(grp.iloc[0].get(GOLD_COL, "")) if GOLD_COL in df.columns else ""
        golds[subject] = gold_raw if gold_raw != "" else None
    return conversions, golds


def pairwise_analysis(conversions):
    """
    Returns:
      per_req: list of dicts {reqId, n_conversions, <metric>: mean_over_pairs}
      pair_scores: {(raterA,raterB): [chrF, ...]} accumulated across requirements
      overall: {metric: mean over requirements of the per-req pair-mean}
    """
    per_req = []
    pair_scores = {}
    metric_reqmeans = {m: [] for m in METRIC_ORDER}

    for subject in sorted(conversions.keys()):
        raters = sorted(conversions[subject].keys())
        if len(raters) < 2:
            warn(f"requirement {subject} has < 2 conversions; excluded from pairwise similarity")
            continue
        pair_vals = {m: [] for m in METRIC_ORDER}
        for ra, rb in combinations(raters, 2):
            a = conversions[subject][ra]
            b = conversions[subject][rb]
            scores = all_metrics(a["norm"], b["norm"], a["tokens"], b["tokens"])
            for m in METRIC_ORDER:
                pair_vals[m].append(scores[m])
            key = tuple(sorted((ra, rb)))
            pair_scores.setdefault(key, []).append(scores["chrF"])
        row = {"reqId": subject, "n_conversions": len(raters)}
        for m in METRIC_ORDER:
            mean_m = float(np.mean(pair_vals[m]))
            row[m] = mean_m
            metric_reqmeans[m].append(mean_m)
        per_req.append(row)

    overall = {m: (float(np.mean(v)) if v else float("nan")) for m, v in metric_reqmeans.items()}
    return per_req, pair_scores, overall


def gold_analysis(conversions, golds):
    """
    Per-annotator mean similarity to the canonical/gold conversion, over
    requirements that have both a gold and that annotator's conversion.
    Returns (table, raters, n_gold_reqs) or None if no gold conversions exist.
    """
    gold_reqs = [s for s, g in golds.items() if g]
    if not gold_reqs:
        return None

    raters = set()
    for s in gold_reqs:
        raters.update(conversions.get(s, {}).keys())
    raters = sorted(raters)
    if not raters:
        return None

    # table[rater][metric] = list of scores
    table = {r: {m: [] for m in METRIC_ORDER} for r in raters}
    for s in gold_reqs:
        gnorm = golds[s]
        gtok = tokenize(gnorm)
        for r, conv in conversions.get(s, {}).items():
            # directional chrF(annotator -> gold) is the standard "hypothesis vs reference"
            scores = {
                "chrF": _chrf_directional(conv["norm"], gnorm),
                "tokenJaccard": token_jaccard(conv["tokens"], gtok),
                "editSim": edit_similarity(conv["norm"], gnorm),
            }
            for m in METRIC_ORDER:
                table[r][m].append(scores[m])
    return table, raters, len(gold_reqs)


# --- Rendering --------------------------------------------------------------
def fmt(x):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "n/a"
    return f"{x:.3f}"


def build_report(meta, per_req, pair_scores, overall, gold):
    lines = []
    L = lines.append

    L("# Rimay conversion similarity report")
    L("")
    L(f"- Export: `{meta['export']}`")
    L(f"- Requirements with conversions: **{meta['n_req_with_conv']}**")
    L(f"- Annotators ({len(meta['annotators'])}): {', '.join(meta['annotators'])}")
    if meta["phases"]:
        L(f"- Phase(s): {', '.join(meta['phases'])}")
    L("")
    L("Surface-form string similarity (0–1, higher = more similar). **chrF** = "
      "character n-gram F₂; **tokenJaccard** = token-set overlap; **editSim** = "
      "1 − normalized character edit distance. These measure wording, not meaning, "
      "and are not chance-corrected — a low score flags surface divergence to "
      "inspect, not necessarily a real disagreement.")
    L("")

    # Overall inter-annotator
    L("## Inter-annotator similarity (overall)")
    L("")
    L("Mean pairwise similarity across annotators, averaged over requirements.")
    L("")
    L("| Metric | Mean |")
    L("|--------|-----:|")
    for m in METRIC_ORDER:
        L(f"| {m} | {fmt(overall[m])} |")
    L("")

    # Annotator-pair chrF matrix
    if pair_scores:
        L("## Annotator-pair mean chrF")
        L("")
        L("Mean chrF between each pair of annotators (over requirements where both "
          "wrote a conversion). Spots an annotator whose conversions consistently "
          "diverge from the others.")
        L("")
        L("| Pair | Mean chrF | Requirements |")
        L("|------|----------:|-------------:|")
        for pair in sorted(pair_scores.keys()):
            vals = pair_scores[pair]
            L(f"| {pair[0]} ↔ {pair[1]} | {fmt(float(np.mean(vals)))} | {len(vals)} |")
        L("")

    # Gold
    if gold is not None:
        table, raters, n_gold = gold
        L("## Similarity to the adjudicated reference (canonicalRimay)")
        L("")
        L(f"Mean similarity of each annotator's conversion to the gold conversion, "
          f"over the {n_gold} requirement(s) that have a canonical Rimay.")
        L("")
        L("| Annotator | chrF | tokenJaccard | editSim | n |")
        L("|-----------|-----:|-------------:|--------:|--:|")
        for r in raters:
            n = len(table[r]["chrF"])
            cells = " | ".join(
                fmt(float(np.mean(table[r][m]))) if table[r][m] else "n/a" for m in METRIC_ORDER
            )
            L(f"| {r} | {cells} | {n} |")
        L("")

    # Per-requirement worksheet (worst agreement first)
    L("## Per-requirement similarity (lowest agreement first)")
    L("")
    if not per_req:
        L("No requirement had 2+ conversions to compare.")
    else:
        L("Requirements sorted by mean pairwise chrF ascending — the top rows are "
          "where annotators' conversions diverged most.")
        L("")
        L("| Requirement | #conv | chrF | tokenJaccard | editSim |")
        L("|-------------|------:|-----:|-------------:|--------:|")
        for row in sorted(per_req, key=lambda r: r["chrF"]):
            L(
                f"| {row['reqId']} | {row['n_conversions']} | {fmt(row['chrF'])} | "
                f"{fmt(row['tokenJaccard'])} | {fmt(row['editSim'])} |"
            )
    L("")

    # Data notes
    if WARNINGS:
        L("## Data notes")
        L("")
        seen = []
        for w in WARNINGS:
            if w not in seen:
                seen.append(w)
        L(f"{len(seen)} note(s):")
        L("")
        for w in seen[:50]:
            L(f"- {w}")
        if len(seen) > 50:
            L(f"- … and {len(seen) - 50} more.")
        L("")

    return "\n".join(lines)


def print_summary_stdout(overall, gold):
    print("\nInter-annotator conversion similarity (overall)")
    print(f"{'metric':<16}{'mean':>8}")
    print("-" * 24)
    for m in METRIC_ORDER:
        print(f"{m:<16}{fmt(overall[m]):>8}")
    if gold is not None:
        _, raters, n_gold = gold
        print(f"\n(vs. adjudicated reference over {n_gold} requirement(s) — see report for the table)")
    print()


def main():
    parser = argparse.ArgumentParser(description="Rimay conversion-text similarity analysis.")
    parser.add_argument("--export", required=True, help="Path to the export CSV.")
    parser.add_argument("--out", required=True, help="Path to write the markdown report.")
    args = parser.parse_args()

    try:
        df = pd.read_csv(args.export, dtype=str, keep_default_na=False)
    except FileNotFoundError:
        print(f"ERROR: export file not found: {args.export}", file=sys.stderr)
        sys.exit(1)

    for required in (SUBJECT_COL, RATER_COL):
        if required not in df.columns:
            print(f"ERROR: required column '{required}' missing from export.", file=sys.stderr)
            sys.exit(1)
    if TEXT_COL not in df.columns:
        print(f"ERROR: no '{TEXT_COL}' column in export — nothing to compare.", file=sys.stderr)
        sys.exit(1)

    df = df[df[RATER_COL].astype(str).str.strip() != ""].copy()
    if df.empty:
        print("ERROR: no annotated rows found in the export.", file=sys.stderr)
        sys.exit(1)

    conversions, golds = build_conversions(df)
    if not conversions:
        print("ERROR: no non-empty conversions (rimayText) found — nothing to analyse.", file=sys.stderr)
        sys.exit(1)

    per_req, pair_scores, overall = pairwise_analysis(conversions)
    gold = gold_analysis(conversions, golds)

    annotators = sorted(df[RATER_COL].unique())
    phases = sorted(df["phase"].unique()) if "phase" in df.columns else []
    meta = {
        "export": args.export,
        "n_req_with_conv": len(conversions),
        "annotators": annotators,
        "phases": phases,
    }

    report = build_report(meta, per_req, pair_scores, overall, gold)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(report)

    print_summary_stdout(overall, gold)
    print(f"Wrote report to {args.out}")
    if gold is None:
        print("(No canonicalRimay reference found — gold-similarity section skipped.)")


if __name__ == "__main__":
    main()
