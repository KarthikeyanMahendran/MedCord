# UC-006 Send and receive message

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Composer sends text via Nexconn SDK to channel. 2 Peers receive in real time. 3 Webhook mirrors message to Postgres. 4 History loads via SDK query.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: send/receive/history. DB: messages (mirror via webhook).

## API
Webhook POST /webhooks/nexconn; GET /api/v1/channels/{id}/messages (mirror, for search/threads)

## UI
Message pane, composer

## Acceptance criteria
- Message appears <1s for peers; idempotent webhook; history paginates 50/page; offline user sees message on reconnect.
- Unit + integration tests cover main and one error flow.
