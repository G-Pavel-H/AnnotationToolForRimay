# Rimay Annotation Tool

A local web app for a small team (4 annotators incl. the admin) to annotate
natural-language requirements by converting them to **Rimay** (a controlled NL)
and flagging structural incompleteness. **Inter-annotator agreement (Fleiss' and
Cohen's Kappa) is computed in the app** — Admin → Agreement. The export still
feeds the separate Python pipeline for conversion quality (similarity on the
Rimay text).

This is an internal research tool, not a public product. It optimises for clean
data capture, **blind annotation**, and a low-friction annotator experience.

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | Angular 19 (standalone components), Angular Material, `ngx-markdown` |
| Backend  | Node.js + Express, REST API |
| Database | MongoDB Atlas (cloud), via Mongoose |
| Auth     | JWT, username/password (bcrypt). Users are **seeded**, not self-registered. |

## Documentation

- **[WORKFLOW.md](./WORKFLOW.md)** — how the team uses the tool end to end
  (shared cloud DB, admin setup, import → annotate → export). **Read this first.**
- **[DATABASE.md](./DATABASE.md)** — the database structure / schema of every
  collection.

## Repository layout

```
AnnotationToolForRimay/
├── setup.js            one-step setup (prompts for MONGO_URI, installs deps)
├── start.js            launches backend + frontend together
├── package.json        root scripts: `npm run setup`, `npm start`
├── backend/            Express + Mongoose API
│   ├── src/            models, routes, middleware, utils
│   ├── scripts/        seed_users.js, import_requirements.js
│   └── tests/          node:test unit + API tests
├── frontend/           Angular app
│   └── src/assets/annotation_guide.md   editable reference guide (markdown)
├── WORKFLOW.md         team workflow & architecture
├── DATABASE.md         database schema
└── README.md
```

## Roles

- **annotator** — sees only their own assigned requirements and their own
  annotations. Never sees other annotators' work or the Pragyan incompleteness
  labels.
- **admin** — manages the dataset, organises requirements into groups, views all
  annotations, runs adjudication, reads the agreement report, exports data. The
  admin is also an annotator.

`pragyanIncomp` is **never serialised to an annotator** — this is enforced in the
requirements serializer (`backend/src/utils/serializers.js`), not just the UI.

---

## Setup & run

Uses **MongoDB Atlas** (cloud). No local database or Docker required.
Prerequisite: **[Node.js](https://nodejs.org) v20+**.

### Quick start (recommended — especially for annotators)

Two commands from the project root:

```bash
npm run setup     # prompts for the MongoDB URI, writes backend/.env, installs everything
npm start         # launches backend + frontend, prints http://localhost:4200
```

`setup` auto-generates a private `JWT_SECRET` and installs both apps. `start`
runs the API (port 4000) and the Angular dev server (port 4200) together and
shows the link to open; Ctrl+C stops both. See **[WORKFLOW.md](./WORKFLOW.md)**
for the full team flow (who imports the data, phases, export → Python).

> **Admin only, once:** after `npm run setup`, seed the users and import the
> corpus:
> ```bash
> cd backend
> npm run seed
> npm run import -- "../../Datasets/Pragyan/100-FeatureRequests-Corpus-Reconciled.csv" training
> ```
> Annotators skip this — the data is already in the shared DB.

---

### Manual setup (the same thing, by hand)

#### 1. Backend

```bash
cd backend
npm install
# Edit backend/.env and paste your Atlas connection string into MONGO_URI.
npm run seed                # create the 4 users
npm run import -- "../../Datasets/Pragyan/100-FeatureRequests-Corpus-Reconciled.csv" pilot
npm run dev                 # http://localhost:4000
```

The only thing you must fill in is `MONGO_URI` in `backend/.env` — paste the
Atlas URI (Atlas → Database → Connect → Drivers), replace `<password>`, and add
the database name (e.g. `/rimay_annotation`) before the `?`. Make sure your
machine's IP is allowed under Atlas → Network Access.

`npm run import -- <path-to-csv> [phase]` upserts requirements from the Pragyan
corpus CSV (default phase `main`). You can also import later from the admin UI
(**Admin → Dataset → Import corpus CSV**).

Run the tests (these use a throwaway in-memory MongoDB, so they don't touch
Atlas):

```bash
npm test
```

#### 2. Frontend

```bash
cd frontend
npm install
npm start                   # http://localhost:4200
```

`npm start` runs `ng serve` with a dev proxy (`proxy.conf.json`) that forwards
`/api` to `http://localhost:4000`, so the backend must be running.

### Default seeded credentials

| Role      | Username | Password |
|-----------|----------|----------|
| admin     | admin    | admin123 |
| annotator | Rafo     | pass123  |
| annotator | Arthur   | pass123  |
| annotator | Mko      | pass123  |

Override these in `backend/.env` (`SEED_ADMIN`, `SEED_ANNOTATOR_1`, …) using the
format `username:password:Display Name`, then re-run `npm run seed`. Change
`JWT_SECRET` to any random string.

---

## Data model (MongoDB)

- **users** — `username`, `passwordHash`, `displayName`, `role`.
- **requirements** — `reqId`, `nlText`, `nlDescription`, `pragyanIncomp` (admin
  only), `phase` (the **group**: any name you choose, default `main`), `order`.
- **annotations** — one per (requirement, annotator), enforced by a unique
  compound index. Holds `rimayText`, the five `slots`
  (`present`/`implied`/`missing`), `conditionType`, `patternNumber`,
  `nonAtomic`/`nSystemResponses`, `overallIncomplete` (computed server-side),
  `notes`, `status` (`draft`/`submitted`).
- **adjudications** — one per requirement: `goldSlots`, `goldConditionType`,
  `goldOverallIncomplete`, optional `canonicalRimay`, `hadDisagreement`.

### Computed incompleteness

`overallIncomplete` is computed **server-side** and stored — never typed by the
annotator. Rule (`backend/src/utils/incompleteness.js`):

> `true` if any of **actor**, **modalVerb**, or **action** is `"missing"`.

Scope and condition are optional in Rimay, so their being missing does not make a
requirement incomplete. The frontend's live verdict chip mirrors this rule for UX;
the stored value always comes from the server on save.

---

## API summary

All annotation/requirement endpoints require a valid JWT. Admin endpoints also
check the role.

**Auth**
- `POST /api/auth/login` → `{ token, user }`
- `GET  /api/auth/me`

**Requirements (annotator-facing, pragyanIncomp stripped)**
- `GET /api/requirements` (with joined per-user `annotationStatus`)
- `GET /api/requirements/:id`

**Annotations (annotator-facing)**
- `GET  /api/annotations/mine/:requirementId`
- `POST /api/annotations` (create or upsert a draft)
- `PUT  /api/annotations/:id`
- `POST /api/annotations/:id/submit`

**Admin**
- `POST /api/admin/requirements/import` (multipart CSV; optional `phase` field)
- `GET  /api/admin/phases` (groups in use + counts)
- `PUT  /api/admin/phases/rename` (`{ from, to }`; renaming onto an existing group merges)
- `PUT  /api/admin/requirements/:id/phase`
- `PUT  /api/admin/requirements/phase/bulk`
- `GET  /api/admin/progress`
- `GET  /api/admin/annotations/:requirementId` (all annotators, side by side)
- `POST /api/admin/adjudications/:requirementId`
- `GET  /api/admin/agreement?phase=<group>&status=all|submitted`
- `GET  /api/admin/export?format=json|csv&phase=<group>`

### Export shape

Analysis-ready: **one record per (requirement, annotator)** with all slot values
flattened (`slot_*`), the gold standard (`gold_*`, `canonicalRimay`), and
`pragyanIncomp` joined in (export is admin-only, so the Pragyan label is included
here on purpose). Requirements with no annotations still emit one row.

## Groups

Every requirement belongs to a **group** (the `phase` field). Groups are
free-form: `training`, `pilot`, `main` are only the suggested starter names —
type any name (up to 40 characters) and that group exists. The list of groups is
just the distinct names in use, so nothing needs configuring.

From **Admin → Dataset** you can pick the group new imports land in, move a
single requirement (including to a brand-new group), move everything at once, and
rename a group — renaming onto an existing name **merges** the two. Annotators
see one tab per group they have work in.

## Agreement (in-app)

**Admin → Agreement** computes inter-annotator agreement over the same rows the
export produces, scoped to one group or all, optionally ignoring drafts:

- **Fleiss' Kappa** per slot and per extra categorical field (`overallIncomplete`,
  `conditionType`, `nonAtomic`), across all annotators at once.
- **Cohen's Kappa** for every pair of annotators, so you can see *who* disagrees
  with whom, plus the mean over pairs.
- **Raw agreement** (unanimous, ≥(n−1)-of-n) beside each Kappa, because Kappa
  reads low when one category dominates (the *Kappa paradox*).
- **Landis & Koch bands**, with anything below `substantial` (< 0.61) flagged as
  a candidate for refining the annotation guide.
- **Agreement with the adjudicated gold**, per annotator per slot.
- A **disagreement worksheet** — every (requirement, field) where annotators
  split, with the vote breakdown and a direct link into adjudication.
- **Report (.md)** downloads the whole thing as markdown.

The maths lives in `backend/src/utils/agreement.js` (pure functions, no DB) and
is verified against the committed pilot report from the Python script, so the
in-app and offline numbers agree exactly. `analysis/pilot_agreement.py` is still
there for reproducible offline reports; the Rimay-text similarity analysis
remains Python-only.

---

## The reference guide

The annotation guide is a markdown asset at
`frontend/src/assets/annotation_guide.md`, rendered live in the editor's
collapsible sidebar via `ngx-markdown`. The team can refine the annotation rules
during the pilot **without a code change** — just edit the markdown and reload
(in dev, `ng serve` picks it up; for a production build, rebuild the frontend).

---

## Non-goals

No public registration, email, password reset, or role self-service. No in-app
analysis of the free-text Rimay conversions — the similarity metrics stay in the
Python pipeline, and the conversions are stored and exported individually rather
than reconciled to a single gold value. No deployment hardening (HTTPS, rate
limiting) — this runs locally for a known team.
