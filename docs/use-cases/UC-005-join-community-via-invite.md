# UC-005 Join community via invite

**Actor:** User
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Admin creates invite link (expiry, max uses). 2 User opens link. 3 Membership created. 4 User added to Nexconn channels.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: invites, memberships. Nexconn: group join.

## API
POST /api/v1/communities/{id}/invites, POST /api/v1/invites/{code}/join

## UI
Invite modal, join landing page

## Acceptance criteria
- Expired/over-used invite rejected; banned users cannot join.
- Unit + integration tests cover main and one error flow.
