# UC-020 Audit log

**Actor:** Admin
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Sensitive actions recorded (role change, ban, delete, edit by moderator, verification). 2 Admin filters/export.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: audit_log (append-only).

## API
GET /api/v1/communities/{id}/audit

## UI
Audit table

## Acceptance criteria
- Entries immutable; includes actor, target, before/after, IP.
- Unit + integration tests cover main and one error flow.
