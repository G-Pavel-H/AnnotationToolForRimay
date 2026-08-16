# Database Structure

The app uses **MongoDB** (via Mongoose) on **MongoDB Atlas**. Everything lives in
**four collections**: `users`, `requirements`, `annotations`, `adjudications`.

The schemas are defined in `backend/src/models/`.

---

## Overview & relationships

```
users ───────────────┐
  (annotators+admin)  │ annotatorId
                      ▼
requirements ──────► annotations          (one per requirement × annotator)
  (the corpus)   ▲     │
                 │     │ requirementId
   requirementId │     ▼
                 └── adjudications          (one gold record per requirement)
```

- A **requirement** is one NL feature request to be annotated.
- Each **annotator** produces **one annotation per requirement** (enforced by a
  unique index). 3 annotators + 1 admin → up to 4 annotations per requirement.
- The **admin** later writes **one adjudication** (the gold standard) per
  requirement, after reviewing everyone's annotations side by side.

Agreement on the categorical slots (Fleiss' and Cohen's Kappa) is computed
**in-app** from this data — see `backend/src/utils/agreement.js` and the admin
Agreement tab. The admin JSON/CSV export feeds the separate Python pipeline for
the Rimay-text similarity metrics and any offline analysis.

---

## `users`

Seeded by `backend/scripts/seed_users.js` (never self-registered).

| Field          | Type     | Notes                                   |
| -------------- | -------- | --------------------------------------- |
| `_id`          | ObjectId | Primary key                             |
| `username`     | String   | **Unique**, login name                  |
| `passwordHash` | String   | **bcrypt** hash — never the raw password |
| `displayName`  | String   | Shown in the UI                         |
| `role`         | String   | `"admin"` \| `"annotator"`              |
| `createdAt`    | Date     | Auto                                    |

- The admin is also an annotator (can annotate too).
- The password is never stored or returned in plaintext; `toPublic()` strips the
  hash before a user object is sent to the client.

---

## `requirements`

The corpus, imported from the Pragyan CSV (admin import or `npm run import`).

| Field           | Type     | Notes                                                        |
| --------------- | -------- | ------------------------------------------------------------ |
| `_id`           | ObjectId | Primary key                                                  |
| `reqId`         | String   | **Unique** human ID, e.g. `"72-Signal"`                      |
| `nlText`        | String   | Full source text (`TextUsedForAnnotation`)                   |
| `nlDescription` | String   | Just the "Request Description" portion (for readability)     |
| `pragyanIncomp` | Number   | `0` or `1` — **ADMIN ONLY, never sent to annotators**        |
| `phase`         | String   | Free-form **group** name, e.g. `"pilot"`, `"batch 2"` (default `"main"`) |
| `order`         | Number   | Display/sort order                                           |
| `createdAt`     | Date     | Auto                                                         |

> **🔒 `pragyanIncomp` is stripped server-side** for annotators in
> `backend/src/utils/serializers.js` — not just hidden in the UI. This keeps the
> annotation **blind** so it isn't biased by Pragyan's prior label.

**Import behaviour:** requirements are **upserted by `reqId`**. Re-importing the
same CSV updates the existing rows in place — it never creates duplicates. New
rows land in the group chosen at import time; existing rows keep their group.

**Groups (`phase`) are not an enum.** Any name up to 40 characters works —
`training`/`pilot`/`main` are only the names suggested for an empty dataset. The
set of groups is simply the distinct values in use, so creating a group means
typing its name, and `GET /api/admin/phases` reports the current list with
counts. Names are trimmed and inner whitespace collapsed
(`backend/src/utils/phases.js`), so `"  batch   2 "` and `"batch 2"` are the same
group. Renaming a group onto an existing name merges the two.

---

## `annotations`

One annotator's work on one requirement. The core data of the study.

| Field               | Type     | Notes                                                              |
| ------------------- | -------- | ----------------------------------------------------------------- |
| `_id`               | ObjectId | Primary key                                                        |
| `requirementId`     | ObjectId | → `requirements._id`                                               |
| `annotatorId`       | ObjectId | → `users._id` (taken from the JWT, never from the client body)     |
| `rimayText`         | String   | The full Rimay conversion; may contain `<MISSING_*>` placeholders  |
| `slots`             | Object   | Five structural slots (see below)                                 |
| `conditionType`     | String   | `"precondition"` \| `"trigger"` \| `"temporal"` \| `"none"`       |
| `patternNumber`     | Number?  | `1`–`10`, or `null`                                               |
| `nonAtomic`         | Boolean  | Multiple system responses packed into one requirement?            |
| `nSystemResponses`  | Number?  | Count, only when `nonAtomic` is true                              |
| `overallIncomplete` | Boolean  | **Computed server-side** (see below) — never typed by annotator   |
| `notes`             | String   | Free-text judgment calls                                          |
| `status`            | String   | `"draft"` \| `"submitted"`                                        |
| `createdAt` / `updatedAt` | Date | Auto                                                          |

### `slots` (embedded sub-document)

Each slot is a three-way value: `"present"` \| `"implied"` \| `"missing"`.

| Slot        | Mandatory in Rimay? |
| ----------- | ------------------- |
| `scope`     | optional            |
| `condition` | optional            |
| `actor`     | **mandatory**       |
| `modalVerb` | **mandatory**       |
| `action`    | **mandatory**       |

### Computed: `overallIncomplete`

Authoritative rule in `backend/src/utils/incompleteness.js`, computed and stored
on every save:

> `overallIncomplete = true` if **any of `actor`, `modalVerb`, `action`** is
> `"missing"`.

A missing `scope` or `condition` does **not** make a requirement incomplete
(they're optional in Rimay). The frontend's live "Complete/Incomplete" chip
mirrors this for UX, but the stored value always comes from the server.

### 🔑 Uniqueness

```
unique compound index on (requirementId, annotatorId)
```

This is the guarantee that **one annotator has exactly one annotation per
requirement**. Re-saving (autosave or resubmit) **updates that same document** —
it never creates a second copy and never touches another annotator's record
(the annotator is identified from the auth token, so saves can't cross over).

---

## `adjudications`

The admin's gold standard for one requirement, written during adjudication.
The gold is **categorical only**. The free-text Rimay conversions are never
reconciled to a single value — a requirement has as many valid conversions as it
has annotators, so conversion quality is measured annotator-to-annotator and each
annotation keeps its own `rimayText`. Adjudication resolves the slot labels and
nothing else.

| Field                   | Type     | Notes                                              |
| ----------------------- | -------- | -------------------------------------------------- |
| `_id`                   | ObjectId | Primary key                                        |
| `requirementId`         | ObjectId | → `requirements._id`, **unique** (one per req)     |
| `goldSlots`             | Object   | Same five slots, agreed gold values                |
| `goldConditionType`     | String   | Gold condition type                                |
| `goldOverallIncomplete` | Boolean  | Computed from `goldSlots` (same rule as above)     |
| `resolvedBy`            | ObjectId | → `users._id` (the admin who resolved it)          |
| `hadDisagreement`       | Boolean  | True if annotators differed on any slot            |
| `notes`                 | String   | Adjudication notes                                 |
| `resolvedAt`            | Date     | When saved                                         |

Saving an adjudication **upserts by `requirementId`** (one gold per requirement).

---

## Indexes summary

| Collection      | Index                                      | Purpose                          |
| --------------- | ------------------------------------------ | -------------------------------- |
| `users`         | `username` unique                          | Login lookup, no dup accounts    |
| `requirements`  | `reqId` unique                             | Upsert-by-reqId import           |
| `annotations`   | `(requirementId, annotatorId)` **unique**  | One annotation per pair          |
| `adjudications` | `requirementId` unique                     | One gold per requirement         |

---

## Data-safety notes

- **Nothing is overwritten across annotators.** Saves are scoped to the logged-in
  user via the JWT; the unique index makes collisions impossible.
- **Drafts autosave** (debounced) and survive logout — reopening a requirement
  reloads the exact saved state from the database.
- **`pragyanIncomp` never leaves the server for annotators**, preserving blind
  annotation; it *is* included in the admin-only export for later comparison.
- **Clearing the dataset** (admin "Danger zone" → `DELETE /api/admin/data`)
  deletes all `requirements`, `annotations`, and `adjudications` but **keeps
  `users`**. There is no soft-delete — export first if you might want the data.
