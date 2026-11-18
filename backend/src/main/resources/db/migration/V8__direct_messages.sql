-- DMs are channels without a community, with an explicit participant list.
ALTER TABLE channels ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE channels DROP CONSTRAINT ck_channel_type;
ALTER TABLE channels ADD CONSTRAINT ck_channel_type CHECK (type IN ('TEXT','ANNOUNCEMENT','DM'));
ALTER TABLE channels ADD COLUMN dm_key VARCHAR(400);
CREATE UNIQUE INDEX ux_channels_dm_key ON channels (dm_key) WHERE dm_key IS NOT NULL;
ALTER TABLE channels ADD CONSTRAINT ck_channel_scope CHECK ((type = 'DM' AND community_id IS NULL AND dm_key IS NOT NULL) OR (type <> 'DM' AND community_id IS NOT NULL));

CREATE TABLE dm_participants (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX ix_dm_participants_user ON dm_participants (user_id);

CREATE TABLE user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT ck_no_self_block CHECK (blocker_id <> blocked_id)
);

-- Presence: last heartbeat time; "online" = within the last 90 seconds.
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
