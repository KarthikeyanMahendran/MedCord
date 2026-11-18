# Local dev accounts (mock data)

Load with `make seed` (idempotent, DEV ONLY, never run against production). Password for all: `Passw0rd!Med`

| Email | Role / state | Use for |
|---|---|---|
| admin@medcord.dev | ADMIN, active | admin verification queue, moderation |
| priya.raman@medcord.dev | active, verified (Cardiology) | normal verified doctor |
| arjun.mehta@, sara.ahmed@, liam.oconnor@, meera.nair@, carlos.vega@ `@medcord.dev` | active, verified | multi-user chat/threads testing |
| nina.kapoor@, omar.haddad@ `@medcord.dev` | pending verification | admin approval flow |
| rejected.user@medcord.dev | verification rejected | rejection flow |
| suspended.user@medcord.dev | suspended | login returns 403 |

## Auth API quick reference
```bash
curl -s -X POST localhost:8080/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya.raman@medcord.dev","password":"Passw0rd!Med"}'
curl -s localhost:8080/api/v1/me -H "Authorization: Bearer <accessToken>"
curl -s -X POST localhost:8080/api/v1/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"<token>"}'
```
Access token 15 min; refresh tokens are single-use (rotation); reusing a rotated token revokes all of that user's sessions.

## Seeded communities
| Community | Visibility | Owner | Notes |
|---|---|---|---|
| Cardiology Collective | public | priya.raman | arjun = Admin, sara = Moderator, liam + meera = members |
| Emergency Medicine Hub | public | sara.ahmed | carlos = Moderator |
| Radiology Readers | private | liam.oconnor | invite-only; hidden from discovery |

Each has channels `general`, `announcements` (announcement type), `case-discussions`, `journal-club`.
Permission rules: a member's permissions are the union of their roles; you can only manage roles ranked below your own; Owner cannot be removed or reassigned; only verified users can create communities.
