CREATE TABLE message_reactions (
    message_id UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX ix_reactions_message ON message_reactions (message_id, created_at);

ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN pinned_by UUID REFERENCES users(id);
CREATE INDEX ix_messages_pinned ON messages (channel_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;
