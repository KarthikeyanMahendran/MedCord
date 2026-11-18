# UC-014 Attachments

**Actor:** Member
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User attaches image/file/video. 2 Upload via Nexconn media message. 3 Preview inline. 4 Size/type limits enforced.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
Nexconn: media messages. DB: attachments metadata.

## API
(SDK) sendMediaMessage

## UI
Composer attach, lightbox

## Acceptance criteria
- Disallowed types rejected client+server; DICOM/PHI warning shown.
- Unit + integration tests cover main and one error flow.
