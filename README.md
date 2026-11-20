# Oakline Renovations

A consolidated, localhost-only Oakline Renovations implementation for training and review. It combines the SQLite-backed project repository, authenticated staff routes, role-based authorization, CSRF checks, health endpoints, bounded telemetry, and the accessible staff frontend from the implementation examples.

> Scope: fictional records only. The HTTP server binds to loopback and uses plain HTTP. Do not expose it publicly and do not put real customer data or real staff credentials in it.

## Run and verify

```bash
npm install
npm run verify
```

The verify command runs the backend suite, then starts the application on an ephemeral local port and checks the static page, module script, liveness endpoint, and readiness endpoint.

## Local server

Set unique fictional local-only passphrases before starting:

```bash
$env:OAKLINE_VIEWER_PASSWORD='replace-with-a-unique-long-local-passphrase'
$env:OAKLINE_EDITOR_PASSWORD='replace-with-another-unique-long-local-passphrase'
npm start
```

Open `http://127.0.0.1:3000`. Accounts are `viewer` and `editor`.

- `viewer` may list sample project records.
- `editor` may create, mark reviewed, and delete sample records.
- Authenticated mutations require a session cookie, matching CSRF token, and same-origin request.

A fresh file-backed SQLite database is created at `oakline-demo.sqlite`, unless `OAKLINE_DB_FILE` is set.

## Implementation map

- `src/sqlite.mjs` — SQL.js connection wrapper. Uses file-backed binary persistence while remaining installable without a native SQLite build toolchain.
- `src/db.mjs` — project schema, services, project records, lifecycle events, parameterized SQL, and constrained status transitions.
- `src/auth.mjs` — local demo accounts, scrypt password hashing, server-side sessions, hashed session tokens, CSRF tokens, and permission policy.
- `src/server.mjs` — HTTP routing, static assets, authentication, role checks, CSRF and origin checks, validation, and database integration.
- `src/ops.mjs` — privacy-safe request telemetry, liveness/readiness data, and graceful shutdown handling.
- `public/index.html` and `public/app.mjs` — accessible staff interface.
- `tests/backend.test.mjs` — database, persistence, session, authorization, CSRF, validation, and error boundary tests.
- `qa/smoke.mjs` — isolated end-to-end smoke gate.

## Verified evidence

Verified locally on Node.js v20.18.1 with `npm run verify`:

- Backend suite: **8 passed**, **0 failed**, **0 skipped**.
- Coverage confirmed:
  - seeded repository and empty project state,
  - project create/review/delete lifecycle and repeat-review idempotence,
  - foreign-key rejection and SQL-like label stored as data,
  - file-backed persistence after close and reopen,
  - liveness and readiness responses,
  - anonymous access denial, viewer read access denial for viewer mutation, editor CRUD,
  - missing CSRF rejection and untrusted-origin rejection,
  - malformed JSON, unsupported media type, and invalid project data boundaries,
  - static page and module smoke check, plus live/ready endpoints.

The database layer uses SQL.js rather than Node's `node:sqlite` API because the local Node 20 runtime does not include that API and native `better-sqlite3`/`sqlite3` builds were not available in this environment. The schema, repository boundaries, prepared-statement patterns, lifecycle behavior, and API tests follow the transcript examples.
