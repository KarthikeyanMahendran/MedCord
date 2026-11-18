# UC-003 Create community

**Actor:** Verified user
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User creates community (name, description, specialty tag, visibility). 2 Creator becomes owner. 3 Default #general and #announcements channels created.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: communities, memberships, channels. Nexconn: ChannelTransport creates channel(s).

## API
POST /api/v1/communities, GET /api/v1/communities

## UI
Community rail '+' dialog

## Acceptance criteria
- Owner role assigned; two default channels exist; community listed for creator.
- Unit + integration tests cover main and one error flow.
