-- Partial index on messages timeline for fast latest-message and channel queries
CREATE INDEX IF NOT EXISTS ix_messages_timeline ON messages (channel_id, created_at DESC, id DESC) WHERE thread_id IS NULL;

-- Index on dm_participants for fast user channel lookups with joined_at
CREATE INDEX IF NOT EXISTS ix_dm_participants_user_joined ON dm_participants (user_id, joined_at DESC);

-- Index on channels for type DM lookups
CREATE INDEX IF NOT EXISTS ix_channels_dm_type ON channels (id) WHERE type = 'DM';
