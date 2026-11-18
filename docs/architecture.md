# MedCord architecture

## Overview
```
 React (Vite, TS)  ──/api/v1──▶  Spring Boot 4 (Java 21)  ──JPA/Flyway──▶  PostgreSQL
        │                              │
        └── (future) Nexconn SDK ◀──── NexconnGateway / ChannelTransport (realtime fan-out)
```
- **Postgres is the source of truth** for every domain object, including messages, edit history, threads, reactions, pins, reports and the audit log.
- **Nexconn is the realtime delivery layer** (ADR 0004). All Nexconn access is behind `NexconnGateway` and `ChannelTransport`; the backend currently runs with a no-op transport and the UI polls (4s for messages, 15s for DM list, 30s heartbeat for presence).
- Messages are sent **through the backend**, which enforces permissions, then persists and notifies the transport.

## Backend packages (`backend/src/main/java/com/medcord`)
| Package | Responsibility |
|---|---|
| `auth` | register/login/refresh/logout, JWT (HS256), refresh-token rotation + reuse detection, `/me` |
| `user` | `User`, `ProfessionalProfile`, presence helper |
| `admin` | licence verification queue + decision audit |
| `community` | communities, channels, roles/permissions, members, invites, bans; `PermissionService` |
| `message` | messages, replies, edit snapshots, soft delete, threads, reactions, pins; `ChannelAccess` |
| `dm` | direct/group DMs (a DM is a channel with participants), blocks, presence heartbeat |
| `search` | Postgres full-text search, access-filtered |
| `moderation` | timed mutes, message reports |
| `audit` | append-only audit trail (survives community deletion) |
| `nexconn` | signed Server API gateway, token endpoint, transport boundary |
| `config`, `common` | security chain, rate limiting, RFC 7807 error handling |

## Key rules
- **Permissions** are the union of a member's role permissions (`MANAGE_COMMUNITY, MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_MEMBERS, CREATE_INVITE, SEND_MESSAGES, POST_ANNOUNCEMENTS, MODERATE_MESSAGES`). Rank: lower number = higher. You can only act on members and roles ranked below you. Owner cannot be removed or reassigned.
- **`ChannelAccess`** is the single answer to "what can this user do in this channel?" (community roles, or DM participant). Never call `PermissionService` directly from message code.
- **Edits** snapshot the previous body into `message_revisions` before changing the message; deletes are soft with a tombstone revision. Visible to the author and moderators.
- **Threads** are ordinary messages with `thread_id`; excluded from the main timeline; reply counts are computed on read.
- **DMs** require a shared community, respect blocks (both directions), max 10 people.
- **Search** uses `to_tsvector('simple', body)` with a GIN index; snippets mark matches with U+E000/U+E001 sentinels, never HTML.
- **Migrations**: Flyway `V1…V10`; Hibernate runs with `ddl-auto=validate`. Never edit a merged migration.

## Data model (tables)
users, professional_profiles, refresh_tokens, verification_decisions · communities, channels, roles, role_permissions, memberships, membership_roles, invites, community_bans · messages, message_revisions, threads, message_reactions · dm_participants, user_blocks · community_mutes, message_reports, audit_log.

## Frontend (`frontend/src`)
`api/` (axios client with transparent token refresh) · `context/` (Auth, Theme) · `components/ui` (design kit) · `components/chat` (MessageItem, ThreadPanel, Highlight, PresenceDot) · `components/community` (ModerationPanel, AuditPanel) · `pages/` (Login, Register, Home, Communities, CommunityDetail, ChannelChat (channels + DMs), Search, admin/Verifications, JoinInvite).
