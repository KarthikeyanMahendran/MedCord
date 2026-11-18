# UC-011 Reactions

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User adds/removes emoji. 2 Stored as Nexconn message metadata. 3 Mirrored to reactions table. 4 Bar updates live.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: metadata set/delete. DB: reactions.

## API
PUT/DELETE /api/v1/messages/{id}/reactions/{emoji}

## UI
Reaction bar, emoji picker

## Acceptance criteria
- One reaction per user per emoji; counts consistent after reconnect.
- Unit + integration tests cover main and one error flow.
