# ADR 0004 – Messages are sent through the backend; Nexconn is the delivery layer

Status: accepted (2026-11-18). Supersedes the "client sends via Nexconn SDK" assumption in ADR 0001/0002.

## Context
Client-side SDK sending cannot enforce MedCord rules (announcement-only channels, archived channels, role permissions, edit windows) and gives no place to snapshot edits. Nexconn is also unreachable from the current dev network (DNS filter).

## Decision
- `POST /api/v1/channels/{id}/messages` validates permissions, persists the message (Postgres is the source of truth), then notifies `ChannelTransport` (Nexconn when available) for realtime fan-out.
- Clients read history from the API. Until Nexconn realtime is wired, the UI polls; with Nexconn it refreshes on pushed events.
- Edits write a `message_revisions` snapshot before changing the message; deletes are soft with a tombstone revision.

## Consequences
+ Server-side authorization, audit, search and threads all work on our own data.
+ Works and is testable without Nexconn connectivity.
- One extra hop per message versus direct SDK send; acceptable at our scale, and Nexconn still delivers the realtime event.
