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

## Additional Verification — 2026-11-21

The following checks were completed after the original 2026-11-18 verification record.

### Browser and Accessibility Checks

- Viewer and editor sign-in and sign-out tested manually.
- Editor project creation, review, and deletion tested using fictional data.
- Session restoration after browser refresh verified.
- Keyboard navigation, form labels, accessible status messages, and responsive layout reviewed.
- Chrome Lighthouse Accessibility score: 100/100.

### Lighthouse Audit Results

| Category | Score |
|---|---|
| Performance | 100/100 |
| Accessibility | 100/100 |
| Best Practices | 96/100 |
| SEO | 100/100 |

The remaining Best Practices warning concerned an expected HTTP 401 response when a signed-out user requested the protected session endpoint. The authentication behavior was retained rather than weakened to improve the score.

Lighthouse results represent the tested local configuration, not a guarantee of accessibility or performance in every environment.

### Continuous Integration

- Added `.github/workflows/verify.yml`.
- GitHub Actions uses Node.js 20 and runs `npm ci` followed by `npm run verify`.
- A GitHub Actions verification run was confirmed successful.
- Subsequent documentation and portfolio updates were committed and pushed to GitHub.

### Scope Reminder

All verification was performed for a fictional localhost-only training application. No public deployment or production-readiness claim is made.
