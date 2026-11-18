# UC-012 Mentions and unread

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 @user/@role/@everyone in composer. 2 Recipients get mention highlight + unread badge. 3 Read state tracked per channel.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: mentions, unread counts, read receipts. DB: mention index.

## API
GET /api/v1/me/mentions

## UI
Mention autocomplete, unread divider, badges

## Acceptance criteria
- @everyone restricted by permission; unread clears on view.
- Unit + integration tests cover main and one error flow.
