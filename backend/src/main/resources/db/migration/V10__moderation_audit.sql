CREATE TABLE community_mutes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    until        TIMESTAMPTZ NOT NULL,
    reason       VARCHAR(500),
    muted_by     UUID        NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ux_mute UNIQUE (community_id, user_id)
);

CREATE TABLE message_reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    reporter_id  UUID        NOT NULL REFERENCES users(id),
    reason       VARCHAR(20) NOT NULL,
    details      VARCHAR(1000),
    status       VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    handled_by   UUID        REFERENCES users(id),
    handled_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_report_reason CHECK (reason IN ('SPAM','HARASSMENT','PHI','MISINFORMATION','OTHER')),
    CONSTRAINT ck_report_status CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
    CONSTRAINT ux_report_once UNIQUE (message_id, reporter_id)
);
CREATE INDEX ix_reports_queue ON message_reports (community_id, status, created_at);

-- Append-only. No foreign key on community_id on purpose: the trail must outlive a deleted community.
CREATE TABLE audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID,
    actor_id     UUID        NOT NULL,
    action       VARCHAR(40) NOT NULL,
    target_type  VARCHAR(20),
    target_id    UUID,
    summary      VARCHAR(500) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_community ON audit_log (community_id, created_at DESC);
