# Workflow & Architecture

How the tool is meant to be used by the team, end to end. Read this first if
you're confused about "who has what data."

---

## The one key idea

**There is only ONE copy of the dataset, and it lives in MongoDB Atlas (the
cloud) — not on anyone's laptop.**

The app each person runs locally is just a *window* into that one shared cloud
database. The laptop stores nothing; it reads from and writes to Atlas over the
internet.

> Everyone shares data **because everyone's `backend/.env` uses the same
> `MONGO_URI`.** Same connection string → same database → same data for all.

So you do **not** get four copies of the dataset. You get:

```
requirements:  [ 72-Signal ] [ 312-Signal ] ...     ← ONE shared copy of all 100
                    ↑   ↑   ↑   ↑
annotations:   [Rafo][Arthur][Mko][admin]           ← one answer row per person
```

One requirement annotated by four people = **1 requirement row + 4 annotation
rows**. Nobody overwrites anybody — each save is tagged with whoever is logged
in (via their login token), so work is always attributed correctly even though
four separate laptops write into the one database.

(For the full schema, see [`DATABASE.md`](./DATABASE.md).)

---

## Roles

- **admin** — sets up the dataset, organises it into groups, sees everyone's
  work, runs adjudication, reads the agreement report, exports the data. The
  admin is also an annotator.
- **annotator** (Rafo, Arthur, Mko) — sees only their **own** assigned
  requirements and their **own** annotations. Never sees other annotators' work
  or the hidden Pragyan label.

---

## Part 1 — Admin sets up (ONCE)

You (the admin) do this a single time. The annotators do **not** repeat it.

1. **Create the MongoDB Atlas cluster** (free M0 tier is fine) and get the
   connection string: Atlas → Database → Connect → Drivers. Replace `<password>`
   and add the DB name, e.g. `.../rimay_annotation?...`.
2. **Allow access:** Atlas → Network Access → add each annotator's IP, or
   `0.0.0.0/0` to allow from anywhere (simplest for a remote team).
3. Put that string in `backend/.env` as `MONGO_URI`.
4. Install and seed the user accounts + import the corpus:
   ```bash
   cd backend
   npm install
   npm run seed     # creates: admin, Rafo, Arthur, Mko
   npm run import -- "../../Datasets/Pragyan/100-FeatureRequests-Corpus-Reconciled.csv" training
   ```
   (Or import later from the admin UI: **Admin → Dataset → Import corpus CSV**.)
5. **Organise the corpus into groups** in the admin UI (Admin → Dataset). A group
   is any name you choose — `training`, `pilot`, `main`, `batch 2`,
   `reliability`… Type a new name and that group exists; rename a group to move
   everything in it at once (renaming onto an existing name merges them). Groups
   just control which requirements appear in which tab — a way to roll out the
   corpus in stages, or to keep separate sub-studies apart.

> Because all of this writes to the shared Atlas DB, the moment you've done it,
> Rafo / Arthur / Mko will see the same requirements when they log in. They never
> import or seed anything themselves.

### Default logins (change the passwords if you like)

| Role      | Username | Password |
| --------- | -------- | -------- |
| admin     | admin    | admin123 |
| annotator | Rafo     | pass123  |
| annotator | Arthur   | pass123  |
| annotator | Mko      | pass123  |

To change these, edit `SEED_*` in `backend/.env`
(`username:password:Display Name`) and re-run `npm run seed`.

---

## Part 2 — What to share with the annotators

Give each annotator **two things**:

1. **The code** (this repo).
2. **The same `MONGO_URI`** (the shared Atlas string) to paste into their own
   `backend/.env`, plus their username/password.

> The connection string contains the DB password, so only share it privately
> with your trusted team — don't post it publicly. (If you'd rather not share
> the DB password at all, the alternative is to run *one* backend on your machine
> and have annotators point their frontend at your address — but that needs your
> machine online and reachable. Shared-Atlas is usually easier for remote people.)

---

## Part 3 — Each annotator runs it locally (the easy way)

The only prerequisite is **[Node.js](https://nodejs.org) (v20+)** installed.

On their own laptop, each annotator runs **two commands**, once each:

```bash
# 1. One-time setup: paste the shared MONGO_URI when asked, then it installs everything.
npm run setup        # (or:  node setup.js)

# 2. Start the app (run this every time they want to annotate):
npm start            # (or:  node start.js)
```

`npm run setup` prompts for the **MongoDB connection string** (the one thing you
gave them), writes their `backend/.env` with a private auto-generated
`JWT_SECRET`, and installs all dependencies. `npm start` launches the backend and
frontend together and prints the link to open:

```
✅ Rimay Annotation Tool is running
Open:  http://localhost:4200
```

They open that link, log in as themselves, and annotate. They do **not** seed or
import — the data is already in the shared DB. Press **Ctrl+C** in the terminal to
stop the app.

Notes:
- Each laptop runs its own backend, but they all point at the **same Atlas DB**.
  That's fine — MongoDB handles many connections at once.
- `JWT_SECRET` is generated per machine and never shared — each person only talks
  to their own local backend, so it doesn't need to match anyone else's.
- Prefer to do it by hand? `cd backend && npm install && npm run dev` and
  `cd frontend && npm install && npm start` still work.

---

## Part 4 — Annotating

For each requirement, the annotator (see the in-app reference guide for the real
rules):

- writes the **Rimay conversion** (with `<MISSING_*>` placeholders where needed),
- sets the five **slots** (Scope, Condition, Actor, Modal verb, Action) to
  Present / Implied / Missing,
- picks condition type, pattern number, marks non-atomic if relevant,
- adds notes, and **Submits**.

Drafts **autosave** continuously and survive logout — reopening a requirement
reloads the exact saved state from Atlas. The "Complete / Incomplete" verdict is
computed automatically (a requirement is incomplete if Actor, Modal verb, or
Action is Missing).

Groups are worked through in whatever order the admin sets up — typically
**training → pilot → main** — and each group the annotator has work in is a tab
on their dashboard.

---

## Part 5 — Adjudication (admin, optional)

After annotators submit, the admin opens **Admin → Dataset → Adjudicate** on a
requirement to see everyone's answers **side by side**, with disagreements
highlighted, and records a **gold standard** per slot (and optionally a canonical
Rimay). The free-text Rimay conversions are kept individual (not merged) — they
feed the similarity analysis separately.

---

## Part 6 — Agreement (admin, in the app)

**Admin → Agreement** answers *did the annotators agree?* without leaving the
tool. Pick a group (or all groups), optionally ignore drafts, and read:

- **Fleiss' Kappa** per slot — chance-corrected agreement across all annotators.
- **Cohen's Kappa** per pair of annotators — *who* disagrees with whom.
- **Raw agreement** (unanimous, ≥(n−1)-of-n) beside each Kappa, since Kappa reads
  low when one category dominates.
- **Agreement with the gold**, once adjudication has happened.
- A **disagreement worksheet** — every split, with a link straight into
  adjudication. This is the agenda for a reconciliation session.
- **Report (.md)** to save the whole thing for the write-up.

It runs on the same rows the export produces, so it matches the offline Python
report exactly.

---

## Part 7 — The endgame: Export → Python

When annotation is done, the admin clicks **Admin → Export** (JSON or CSV).

Export pulls the **entire shared database into one flat file**: **one row per
(requirement × annotator)**, with every slot value in its own column, plus the
gold standard and the Pragyan label joined in. So one requirement annotated by
four people = four rows.

That file feeds the separate **Python pipeline** for the analysis that is not in
the app — **similarity metrics** comparing each person's free-text Rimay
conversion (✔ one per annotator in the export) — and lets you reproduce the
agreement report offline.

```
annotate independently  →  one shared Atlas DB  →  Agreement tab (Kappa)
                                                →  export one file  →  Python: similarity
```

---

## Resetting

If you need to start over (e.g. after a trial run), the admin can wipe the whole
dataset: **Admin → Dataset → Danger zone → Clear entire dataset**. This deletes
all requirements, all annotations, and all adjudications from the shared DB, but
**keeps the user accounts**. Export first if you might want the data later.
