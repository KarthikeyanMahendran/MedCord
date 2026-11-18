# UC-010 Threads

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User starts thread on a message. 2 Replies carry {threadId, rootMsgId}. 3 Thread panel lists replies; main timeline shows reply count chip. 4 Thread can be archived.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: threads. Nexconn: normal messages with custom fields.

## API
POST /api/v1/messages/{id}/thread, GET /api/v1/threads/{id}/messages, PATCH /threads/{id}

## UI
Thread side panel (Drawer), reply count chip

## Acceptance criteria
- Thread replies hidden from main timeline; counts update via webhook; archived threads read-only.
- Unit + integration tests cover main and one error flow.
