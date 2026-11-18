# UC-018 Notifications and push

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User sets DND per channel/community. 2 Mentions/DMs trigger push (APNs/FCM later). 3 In-app toast.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: DND, push config. DB: notification_prefs.

## API
GET/PUT /api/v1/me/notification-prefs

## UI
Settings > notifications, toasts

## Acceptance criteria
- DND suppresses push but keeps unread.
- Unit + integration tests cover main and one error flow.
