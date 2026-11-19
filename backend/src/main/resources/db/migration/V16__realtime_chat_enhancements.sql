-- Real-time chat enhancements: voice channels, attachments (EXIF-stripped), mentions, read states, notification prefs, bookmarks, voice room presence.

-- 1. Support community VOICE channels (preserving CASE from case rooms)
ALTER TABLE channels DROP CONSTRAINT ck_channel_type;
ALTER TABLE channels ADD CONSTRAINT ck_channel_type CHECK (type IN ('TEXT','ANNOUNCEMENT','DM','VOICE','CASE'));

-- 2. Allow attachment-only messages (MessageService still requires non-blank body OR >=1 attachment)
ALTER TABLE messages DROP CONSTRAINT ck_message_body;
ALTER TABLE messages ADD CONSTRAINT ck_message_body CHECK (char_length(body) BETWEEN 0 AND 4000);

-- 3. Attachments with automatic EXIF stripping metadata
CREATE TABLE message_attachments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        UUID         REFERENCES messages(id) ON DELETE CASCADE,
    channel_id        UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    uploader_id       UUID         NOT NULL REFERENCES users(id),
    original_filename VARCHAR(255) NOT NULL,
    content_type      VARCHAR(100) NOT NULL,
    size_bytes        BIGINT       NOT NULL,
    storage_key       VARCHAR(255) NOT NULL UNIQUE,
    sha256            VARCHAR(64)  NOT NULL,
    width             INT,
    height            INT,
    exif_stripped     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_attachments_message ON message_attachments (message_id);
CREATE INDEX ix_attachments_channel ON message_attachments (channel_id);

-- 4. Per-channel read cursors (unread badges & divider line)
CREATE TABLE channel_read_states (
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id           UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    last_read_message_id UUID        REFERENCES messages(id) ON DELETE SET NULL,
    last_read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, channel_id)
);

-- 5. Mentions (@user, @role, @everyone)
CREATE TABLE message_mentions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    channel_id        UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    mentioned_user_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mention_kind      VARCHAR(16)  NOT NULL,
    label             VARCHAR(120) NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_mention_kind CHECK (mention_kind IN ('USER','ROLE','EVERYONE')),
    CONSTRAINT ux_mentions_msg_user UNIQUE (message_id, mentioned_user_id)
);
CREATE INDEX ix_mentions_user_time ON message_mentions (mentioned_user_id, created_at DESC);
CREATE INDEX ix_mentions_message ON message_mentions (message_id);

-- 6. Notification preferences (global DND / quiet hours + per-channel level)
CREATE TABLE user_notification_prefs (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    dnd_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
    dnd_start   VARCHAR(5),
    dnd_end     VARCHAR(5),
    show_toasts BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE channel_notification_prefs (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    level      VARCHAR(16) NOT NULL DEFAULT 'ALL',
    PRIMARY KEY (user_id, channel_id),
    CONSTRAINT ck_channel_notif_level CHECK (level IN ('ALL','MENTIONS','MUTE'))
);

-- 7. Personal saved / bookmarked messages
CREATE TABLE message_bookmarks (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    note       VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, message_id)
);
CREATE INDEX ix_bookmarks_user_time ON message_bookmarks (user_id, created_at DESC);

-- 8. Community voice/video rooms (live participants + media/screen-share state)
CREATE TABLE voice_room_participants (
    channel_id     UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mic_on         BOOLEAN     NOT NULL DEFAULT TRUE,
    cam_on         BOOLEAN     NOT NULL DEFAULT FALSE,
    screen_sharing BOOLEAN     NOT NULL DEFAULT FALSE,
    joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);
