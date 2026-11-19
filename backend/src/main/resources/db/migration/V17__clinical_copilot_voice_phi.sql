-- Clinical differentiators: AI Clinical Co-Pilot (StreamMessage), Voice Notes + STT, and Pre-Send PHI Guardrail + Nexconn Content Safety.

-- 1. Support AI Co-Pilot streaming messages and Voice Note messages
ALTER TABLE messages DROP CONSTRAINT ck_message_kind;
ALTER TABLE messages ADD CONSTRAINT ck_message_kind CHECK (kind IN ('TEXT','CALL','AI','VOICE'));

-- 2. Extend attachments for HD voice notes and speech-to-text transcripts
ALTER TABLE message_attachments ADD COLUMN duration_seconds INT;
ALTER TABLE message_attachments ADD COLUMN transcript TEXT;
ALTER TABLE message_attachments ADD COLUMN transcript_status VARCHAR(16) NOT NULL DEFAULT 'NONE';
ALTER TABLE message_attachments ADD CONSTRAINT ck_attachment_transcript_status
    CHECK (transcript_status IN ('NONE','PENDING','COMPLETED','FAILED'));
ALTER TABLE message_attachments ADD COLUMN nexconn_message_id VARCHAR(128);

-- 3. Per-community PHI privacy shield policy
CREATE TABLE community_safety_policies (
    community_id UUID        PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
    phi_mode     VARCHAR(16) NOT NULL DEFAULT 'WARN',
    auto_redact  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_safety_phi_mode CHECK (phi_mode IN ('OFF','WARN','STRICT_BLOCK'))
);

-- 4. Custom restricted terms (synced to Nexconn /v4/profanity-word/* when configured)
CREATE TABLE community_blocked_terms (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id      UUID         NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    term              VARCHAR(120) NOT NULL,
    synced_to_nexconn BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by        UUID         NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ux_blocked_term_community UNIQUE (community_id, term)
);
CREATE INDEX ix_blocked_terms_community ON community_blocked_terms (community_id);
