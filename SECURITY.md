# Security

- Report vulnerabilities privately to the maintainers; do not open a public issue.
- Secrets live only in environment variables / a secrets manager. `.env` is gitignored; CI scans history with gitleaks.
- Passwords: BCrypt. Sessions: 15-minute JWT access tokens + single-use rotating refresh tokens stored hashed; reuse of a rotated token revokes all sessions.
- All authorization is enforced server-side (`PermissionService`, `ChannelAccess`); the UI only hides controls.
- Auth endpoints are rate limited; error responses never reveal whether an email exists.
- MedCord must not store patient data (PHI). Members can report messages containing PHI; moderators remove them, and every action is audit-logged.
