# Progress

Next up = first unchecked task. Update in every PR.

## Built so far (as of 2026-11-18)

**Product (works end to end locally, see `docs/dev-accounts.md` to sign in)**
| Area | What exists | Use cases |
|---|---|---|
| Accounts | Register, login, JWT + rotating refresh tokens (reuse revokes all sessions), profile edit, rate-limited auth | UC-001, UC-002 |
| Verification | Licence submission, admin approve/reject queue with reasons and audit, resubmission | UC-001, UC-017 |
| Communities | Create (verified only), public/private, discover, invites (expiry, max uses), join/leave, bans | UC-003, UC-005 |
| Channels & roles | Text/announcement channels, archive, Owner/Admin/Moderator/Member + custom roles, rank rules, 8 permissions | UC-004 |
| Messaging | Send, history with cursor paging, replies, edit with revision snapshots, soft delete with tombstones, pins | UC-006–UC-009 |
| Threads | Threads on any message, side panel, live reply counts, archive | UC-010 |
| Reactions | Emoji reactions with per-viewer state | UC-011 |
| DMs & presence | 1:1 and group DMs (≤10, shared-community rule), blocking, online presence via heartbeat | UC-013, UC-019 |
| Search | Postgres full-text across channels and DMs you can access, highlighted snippets | UC-015 |
| Moderation & audit | Timed mutes, message reports (incl. PHI) with moderator queue, owner-only append-only audit log | UC-016, UC-020 |
| UI | "Clinical Graphite" design system (Lexend, one cobalt accent, dark + light), Discord-style shell: server rail, contextual sidebar, chat with members/thread panels | — |

**Platform**
- Backend: Spring Boot 4 / Java 21, Flyway V1–V10, 75 integration tests. Frontend: React 19 / Vite 8 / TypeScript, Node 24 LTS, 53 tests.
- CI (GitHub Actions): backend + Postgres, frontend lint/types/tests/build, gitleaks secret scan (checksum-verified CLI). Dependabot for Maven, npm and Actions.
- Nexconn gateway built and unit-tested; live use blocked by the dev network's DNS filter (`docs/nexconn-notes.md`). Messages flow through the backend (ADR 0004); the UI polls.
- Dev seed: 11 users, 3 communities, conversations, a thread, reactions, DMs. Admin login is set via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`.

**Not built yet:** attachments (T-020), notifications/push and unread counts (T-023), remaining hardening (T-024: httpOnly refresh cookie, Redis rate limiter, Dockerfiles, observability). Deferred: paid surveys (admins author, INR first). Idea backlog: PHI detection before sending.

**Where to read more:** `README.md` (setup) · `docs/architecture.md` (how it fits together) · `docs/adr/` (decisions) · `docs/use-cases/` (20 specs) · `docs/runbook.md` (operations) · `docs/ui-ux-guide.md` (design system).


## M0

- [x] T-001 Repo bootstrap and conventions — `docs/tasks/T-001-repo-bootstrap-and-conventions.md`
- [x] T-002 Makefile, docker-compose, env — `docs/tasks/T-002-makefile-docker-compose-env.md`
- [x] T-003 CI workflows (GitHub Actions: backend+Postgres, frontend, gitleaks; dependabot) — `docs/tasks/T-003-ci-workflows.md`

## M1

- [x] T-004 Backend scaffold — `docs/tasks/T-004-backend-scaffold.md`
- [x] T-005 Postgres db/role and Flyway V1 — `docs/tasks/T-005-postgres-db-role-and-flyway-v1.md`
- [x] T-006 Frontend scaffold and UI kit — `docs/tasks/T-006-frontend-scaffold-and-ui-kit.md`

## M2

- [x] T-007 Auth API and JWT — `docs/tasks/T-007-auth-api-and-jwt.md`
- [x] T-008 Profile and verification workflow — `docs/tasks/T-008-profile-and-verification-workflow.md`

## M3

- [x] T-009 Communities, channels, roles (DB) — `docs/tasks/T-009-communities-channels-roles-db.md`

## M4

- [x] T-010 Nexconn spike and gateway (code + tests done; live verification blocked by network DNS filter, see docs/nexconn-notes.md) — `docs/tasks/T-010-nexconn-spike-and-gateway.md`
- [x] T-011 Messages API (send, history, reply, edit snapshots, delete) — see ADR 0004 — `docs/tasks/T-011-messages-api.md`
- [x] T-012 App shell and channel sidebar (AppShell + chat channel sidebar) — `docs/tasks/T-012-app-shell-and-channel-sidebar.md`
- [x] T-013 Send/receive/history/reply UI (chat UI: send, history, reply, unread-free polling) — `docs/tasks/T-013-send-receive-history-reply-ui.md`

## M5

- [~] T-014 Webhook mirror — superseded by ADR 0004 (backend persists messages directly); Nexconn event ingestion revisited when reachable — `docs/tasks/T-014-webhook-mirror.md`
- [x] T-015 Edit with revisions (backend + UI incl. history modal) — `docs/tasks/T-015-edit-with-revisions.md`
- [x] T-016 Delete/recall with tombstones (soft delete + tombstones, backend + UI) — `docs/tasks/T-016-delete-recall-with-tombstones.md`
- [x] T-017 Threads (backend + side panel UI) — `docs/tasks/T-017-threads.md`
- [x] T-018 Reactions and pins (backend + UI) — `docs/tasks/T-018-reactions-and-pins.md`

## M6

- [x] T-019 DMs, presence, block (1:1 + group DMs, shared-community rule, heartbeat presence) — `docs/tasks/T-019-dms-presence-block.md`
- [ ] T-020 Attachments (open: needs file storage decision, size/type limits and PHI warning) — `docs/tasks/T-020-attachments.md`
- [x] T-021 Search (Postgres full-text, access-filtered, highlighted snippets) — `docs/tasks/T-021-search.md`
- [x] T-022 Moderation and audit log (mutes, reports queue, owner-only audit trail) — `docs/tasks/T-022-moderation-and-audit-log.md`
- [ ] T-023 Notifications and push (blocked on Nexconn reachability for push; in-app unread counts still open) — `docs/tasks/T-023-notifications-and-push.md`

## M7

- [~] T-024 Hardening and deploy (done: auth rate limiting, CI, architecture/runbook/security docs; open: httpOnly refresh cookie, Redis limiter, Dockerfiles, observability) — `docs/tasks/T-024-hardening-and-deploy.md`

## M8 – Rural Case Rooms (Nexconn Build Challenge 2026)

Health workers send a case; verified specialists answer in a per-case chat room. All data is synthetic (ADR 0005).

- [x] T-025 Case room schema: cases, attachments, answers, follow-ups, availability, regions, specialties, red-flag rules, timeline, AI audit log, notifications, impact views; RLS on every table (V12–V14)
- [x] T-026 Case API: submit with rule-based triage (red flags, vitals, specialty), routing to on-duty doctors, accept/answer/follow-up, escalation job, Verified Answer Library, impact, notifications
- [x] T-027 Case UI: new case (symptom tiles, voice dictation in 7 languages, offline queue), doctor queue, case room with chat and read-aloud, library, impact dashboard
- [ ] T-028 Wire the case chat to the Nexconn Chat SDK (currently backend polling every 4s)
- [ ] T-029 Translate replies for the health worker (needs an LLM key); non-English red-flag detection
- [ ] T-030 Case photo and voice-note attachments (builds on T-020)

Notes: migrations V12/V13 were renumbered after `V11__calls.sql` landed on main. Seed demo data with `scripts/seed-cases.sql` after `seed-dev.sql`.

## M9 – Outbreak Radar

Early-warning layer on top of the case rooms. Rule-based, no AI, no patient identity in the alert (ADR 0006).

- [x] T-031 Radar schema (V20): `outbreak_alerts`, `outbreak_alert_cases`, `cases.is_demo`; RLS on both tables
- [x] T-032 Detection: 5 symptom groups (fever + rash, diarrhoea/vomiting, cough/breathing, jaundice, fever + body ache); 3+ similar cases (4+ for the broader groups) in one region within 72 h opens an alert; WATCH becomes ALERT at double the threshold or 2+ urgent cases; alerts fade when no case remains in the window. Runs after each case and once a minute
- [x] T-033 Radar API `/api/v1/outbreaks`: list + map points, detail (guidance, 12 h timeline, anonymised cases for staff only), acknowledge (doctor/admin), resolve (admin), admin demo run/reset
- [x] T-034 Radar UI: dotted India map with pulsing markers, alert list, detail with "what to do", home banner, notifications (doctors, admins, health workers of that area), tour step
- [ ] Next: real district surveillance contact per region; SMS to the district officer; more regions

Notes: Flyway `out-of-order` is now on so migrations added on other branches still apply after V20. Demo: sign in as an admin, open Outbreak radar, press Simulate outbreak (3 fever-and-rash cases in Wayanad Hills), then Reset demo.

