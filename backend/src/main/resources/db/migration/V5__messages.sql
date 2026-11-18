CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id  UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id   UUID         NOT NULL REFERENCES users(id),
    body        TEXT         NOT NULL,
    reply_to_id UUID         REFERENCES messages(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    edited_at   TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID         REFERENCES users(id),
    CONSTRAINT ck_message_body CHECK (char_length(body) BETWEEN 1 AND 4000)
);
CREATE INDEX ix_messages_channel_time ON messages (channel_id, created_at DESC, id DESC);
CREATE INDEX ix_messages_reply ON messages (reply_to_id);

-- Snapshot of the content BEFORE each edit, plus a tombstone on delete. Append-only.
CREATE TABLE message_revisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    revision_no INT         NOT NULL,
    kind        VARCHAR(10) NOT NULL,
    body        TEXT        NOT NULL,
    actor_id    UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_revision_kind CHECK (kind IN ('EDIT','DELETE')),
    CONSTRAINT ux_revision UNIQUE (message_id, revision_no)
);
