-- 1:1 voice/video calls. Media flows through the realtime provider (Nexconn); MedCord authorises calls and keeps the record.
CREATE TABLE calls (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    caller_id        UUID        NOT NULL REFERENCES users(id),
    callee_id        UUID        NOT NULL REFERENCES users(id),
    media            VARCHAR(10) NOT NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'RINGING',
    provider_call_id VARCHAR(128),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    connected_at     TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    ended_by         UUID        REFERENCES users(id),
    CONSTRAINT ck_call_media CHECK (media IN ('AUDIO','VIDEO')),
    CONSTRAINT ck_call_status CHECK (status IN ('RINGING','CONNECTED','ENDED','MISSED','DECLINED','CANCELLED','FAILED'))
);
CREATE INDEX ix_calls_channel ON calls (channel_id, created_at DESC);
CREATE INDEX ix_calls_active_caller ON calls (caller_id) WHERE status IN ('RINGING','CONNECTED');
CREATE INDEX ix_calls_active_callee ON calls (callee_id) WHERE status IN ('RINGING','CONNECTED');

-- Call outcomes appear in the conversation as CALL messages.
ALTER TABLE messages ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'TEXT';
ALTER TABLE messages ADD CONSTRAINT ck_message_kind CHECK (kind IN ('TEXT','CALL'));
ALTER TABLE messages ADD COLUMN call_id UUID REFERENCES calls(id) ON DELETE SET NULL;
