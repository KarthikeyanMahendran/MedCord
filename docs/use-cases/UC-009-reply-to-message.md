# UC-009 Reply to message

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User chooses Reply. 2 Composer shows quoted preview. 3 Sent as Nexconn reference message. 4 Click on quote jumps to original.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: RC:ReferenceMsg. DB: messages.reply_to.

## API
(SDK) send reference message; GET /api/v1/messages/{id}

## UI
Reply preview bar, quote block

## Acceptance criteria
- Reply to deleted message shows placeholder; jump-to-original works across pages.
- Unit + integration tests cover main and one error flow.
