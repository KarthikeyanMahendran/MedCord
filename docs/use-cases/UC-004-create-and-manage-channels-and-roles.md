# UC-004 Create and manage channels and roles

**Actor:** Owner / admin
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Create/rename/archive channel (text, announcement). 2 Create roles with permissions. 3 Assign roles. 4 Per-channel permission overrides.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: channels, roles, role_permissions, member_roles. Nexconn: mute/allowed-sender lists mapped from permissions.

## API
CRUD /api/v1/communities/{id}/channels, /roles, PUT /members/{uid}/roles

## UI
Channel sidebar context menu, settings > roles

## Acceptance criteria
- Permission checks enforced server-side; archived channels read-only; role changes reflected in Nexconn send rights.
- Unit + integration tests cover main and one error flow.
