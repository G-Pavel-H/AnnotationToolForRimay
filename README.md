# Rimay Annotation Tool

A local web app for a small team (4 annotators incl. the admin) to annotate
natural-language requirements by converting them to **Rimay** (a controlled NL)
and flagging structural incompleteness. The captured data feeds a separate
Python pipeline that computes inter-annotator agreement (Fleiss' Kappa on the
categorical slots) and conversion quality (similarity on the Rimay text).

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
- **admin** — manages the dataset, assigns phases, views all annotations, runs
  adjudication, exports data. The admin is also an annotator.

`pragyanIncomp` is **never serialised to an annotator** — this is enforced in the
requirements serializer (`backend/src/utils/serializers.js`), not just the UI.

---

## Setup & run

Uses **MongoDB Atlas** (cloud). No local database or Docker required.

### 1. Backend

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

### 2. Frontend

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
  only), `phase` (`training`/`pilot`/`main`), `order`.
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
- `POST /api/admin/requirements/import` (multipart CSV)
- `PUT  /api/admin/requirements/:id/phase`
- `PUT  /api/admin/requirements/phase/bulk`
- `GET  /api/admin/progress`
- `GET  /api/admin/annotations/:requirementId` (all annotators, side by side)
- `POST /api/admin/adjudications/:requirementId`
- `GET  /api/admin/export?format=json|csv`

### Export shape

Analysis-ready: **one record per (requirement, annotator)** with all slot values
flattened (`slot_*`), the gold standard (`gold_*`, `canonicalRimay`), and
`pragyanIncomp` joined in (export is admin-only, so the Pragyan label is included
here on purpose). Requirements with no annotations still emit one row. The Python
pipeline computes Kappa and similarity from this file.

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
statistical analysis beyond raw progress counts (Kappa + similarity live in the
Python pipeline). No reconciliation of the free-text Rimay conversions to a
single gold value — they are stored and exported individually. No deployment
hardening (HTTPS, rate limiting) — this runs locally for a known team.
