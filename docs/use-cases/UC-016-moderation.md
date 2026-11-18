# UC-016 Moderation

**Actor:** Moderator
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Mute/timeout/kick/ban user. 2 Report message. 3 Profanity filter. 4 All actions logged.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: mute/freeze/ban lists, profanity words. DB: moderation_actions, reports.

## API
POST /api/v1/communities/{id}/moderation/{action}, POST /api/v1/messages/{id}/report

## UI
Member context menu, reports queue

## Acceptance criteria
- Muted user cannot send; actions appear in audit log (UC-020).
- Unit + integration tests cover main and one error flow.
