# Oakline Verification Evidence

## Run identity

- Repository: Oakline Renovations consolidated implementation
- Date: 2026-11-18
- Node.js: v20.18.1
- Database engine: SQL.js with file-backed persistence
- Platform: Windows

## Commands

```bash
npm run verify
```

Equivalent gates:

```bash
npm test
npm run smoke
```

## Result

```text
Backend tests: 8 pass / 0 fail / 0 skipped
Smoke gate: pass
```

## Backend test scope

| Test | Result |
|---|---|
| Fresh repository seeds services and starts empty | pass |
| Project lifecycle is transactional and idempotent | pass |
| Foreign keys and parameterized SQL protect records | pass |
| File-backed records persist after reopening | pass |
| Health endpoints respond independently before authentication | pass |
| Authentication and route permissions are enforced | pass |
| Mutation rejects wrong origin and missing CSRF token | pass |
| Invalid and malformed requests are rejected safely | pass |

## Smoke gate scope

| Check | Actual |
|---|---|
| Static page response | 200 |
| Module script response | 200 |
| Live endpoint | 200 |
| Ready endpoint | pass |

## Explicit limitations

- This runs on loopback over HTTP with fictional data.
- This is not a public-production authentication or deployment configuration.
- The SQL.js adapter is a compatibility substitute for this environment, not a claim of native SQLite operational parity.
