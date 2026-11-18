# UC-019 Presence

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Online/away/offline shown on avatars and member list. 2 Updates in real time.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: user status.

## API
(SDK) status listeners

## UI
PresenceDot, member list

## Acceptance criteria
- Status flips within 5s of connect/disconnect.
- Unit + integration tests cover main and one error flow.
