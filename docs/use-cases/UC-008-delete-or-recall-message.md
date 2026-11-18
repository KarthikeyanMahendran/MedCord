# UC-008 Delete or recall message

**Actor:** Author / moderator
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Author or moderator deletes. 2 Backend writes tombstone revision. 3 Nexconn recall/delete. 4 UI shows 'message deleted'.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: messages.deleted_at, message_revisions (tombstone). Nexconn: /v4/message/delete.

## API
DELETE /api/v1/messages/{id}

## UI
Message hover menu

## Acceptance criteria
- Soft delete retained for audit; moderators can delete any; deleted content hidden from search.
- Unit + integration tests cover main and one error flow.
