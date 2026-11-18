# UC-001 Register and verify professional

**Actor:** Doctor / admin
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 User registers (email, password, name, specialty, license no., country). 2 Account created `PENDING`; Nexconn user registered. 3 Admin reviews queue and approves/rejects. 4 Approved user gets verified badge.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: users, professional_profiles, verification_requests. Nexconn: issue token on first login.

## API
POST /api/v1/auth/register, GET/PATCH /api/v1/admin/verifications

## UI
Register form, profile page, admin verification table (UC-017)

## Acceptance criteria
- Unverified users can browse but not post in verified-only channels; approval flips badge; license number unique per country.
- Unit + integration tests cover main and one error flow.
