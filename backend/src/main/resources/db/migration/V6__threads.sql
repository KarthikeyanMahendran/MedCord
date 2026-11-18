CREATE TABLE threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    root_message_id UUID        NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    title           VARCHAR(120),
    archived        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by      UUID        NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_threads_channel ON threads (channel_id);

-- Thread replies are ordinary messages that point at their thread and are hidden from the main timeline.
ALTER TABLE messages ADD COLUMN thread_id UUID REFERENCES threads(id) ON DELETE CASCADE;
CREATE INDEX ix_messages_thread ON messages (thread_id, created_at, id) WHERE thread_id IS NOT NULL;
