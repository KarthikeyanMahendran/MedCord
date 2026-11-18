# UC-013 Direct and group DMs

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Start DM from profile. 2 Create group DM (≤10). 3 Typing indicator in DMs. 4 Block user.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: direct/group channels, blocklist. DB: dm_channels.

## API
POST /api/v1/dms, POST /api/v1/users/{id}/block

## UI
DM section in sidebar

## Acceptance criteria
- Blocked user cannot DM; DM list sorted by last activity.
- Unit + integration tests cover main and one error flow.
