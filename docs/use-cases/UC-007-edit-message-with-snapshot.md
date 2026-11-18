# UC-007 Edit message with snapshot

**Actor:** Author / moderator
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Author edits own message (within edit window). 2 Backend stores revision snapshot of old content. 3 Backend calls Nexconn message/update. 4 Peers see updated text with (edited).

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: message_revisions. Nexconn: /v4/*-channel/message/update.

## API
PATCH /api/v1/messages/{id}; GET /api/v1/messages/{id}/revisions

## UI
Composer edit mode (↑ key), edit history modal

## Acceptance criteria
- Revision n written before update; non-author gets 403; history visible to author/admins; failure of Nexconn call rolls back revision.
- Unit + integration tests cover main and one error flow.
