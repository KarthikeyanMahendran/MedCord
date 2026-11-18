# UC-017 Admin verification queue

**Actor:** Platform admin
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Admin opens queue. 2 Views license details. 3 Approve/reject with reason. 4 User notified.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: verification_requests. Nexconn: system message to user.

## API
GET/PATCH /api/v1/admin/verifications

## UI
Admin table (Table, Pagination, Badge)

## Acceptance criteria
- Only platform admins; decision recorded with actor + timestamp.
- Unit + integration tests cover main and one error flow.
