# ADR 0002 – Threads and edit snapshots are built in MedCord

Status: accepted (2026-11-18)

Nexconn has no thread API and `message/update` overwrites content without history.

- **Threads:** `threads` table keyed by root message; replies are normal Nexconn messages with custom fields `{threadId, rootMsgId}`; UI shows them in a side panel, not the main timeline. Reply counts come from webhook mirror.
- **Edit history:** all edits go through `PATCH /api/v1/messages/{id}`: write `message_revisions` snapshot of previous content, then call Nexconn update, then update mirror. Deletes keep a tombstone revision for audit.
