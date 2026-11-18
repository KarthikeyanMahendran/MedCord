# UC-015 Search messages

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User searches text with filters (channel, author, date). 2 Postgres full-text on mirror. 3 Results respect channel permissions.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: messages tsvector index.

## API
GET /api/v1/search?q=

## UI
Search bar, results panel

## Acceptance criteria
- Results exclude deleted and inaccessible channels; p95 < 300ms on 1M rows.
- Unit + integration tests cover main and one error flow.
