-- Rural Case Rooms: health workers submit cases, matching doctors consult in a per-case chat room.
-- DEMO DATA ONLY: every case is synthetic (see ADR 0005).

-- A case room is a channel of type CASE, with participants stored in dm_participants.
ALTER TABLE channels DROP CONSTRAINT ck_channel_type;
ALTER TABLE channels ADD CONSTRAINT ck_channel_type CHECK (type IN ('TEXT','ANNOUNCEMENT','DM','CASE'));
ALTER TABLE channels DROP CONSTRAINT ck_channel_scope;
ALTER TABLE channels ADD CONSTRAINT ck_channel_scope CHECK (
    (type IN ('DM','CASE') AND community_id IS NULL AND dm_key IS NOT NULL)
    OR (type NOT IN ('DM','CASE') AND community_id IS NOT NULL));

-- Who the account is: a verified doctor or a community health worker.
ALTER TABLE users ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT 'DOCTOR';
ALTER TABLE users ADD CONSTRAINT ck_users_account_type CHECK (account_type IN ('DOCTOR','HEALTH_WORKER'));
ALTER TABLE users ADD COLUMN preferred_language VARCHAR(10) NOT NULL DEFAULT 'en';

-- Doctor duty status and languages, used by routing.
CREATE TABLE doctor_availability (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    on_duty    BOOLEAN     NOT NULL DEFAULT false,
    languages  VARCHAR(10)[] NOT NULL DEFAULT '{en}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cases (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id         UUID         NOT NULL UNIQUE REFERENCES channels(id) ON DELETE CASCADE,
    reporter_id        UUID         NOT NULL REFERENCES users(id),
    assigned_doctor_id UUID         REFERENCES users(id),
    village            VARCHAR(120),
    patient_age        INT,
    patient_sex        VARCHAR(10),
    chief_complaint    TEXT         NOT NULL,
    vitals             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    original_language  VARCHAR(10)  NOT NULL DEFAULT 'en',
    original_text      TEXT,
    sbar               JSONB,
    urgency            VARCHAR(10)  NOT NULL DEFAULT 'GREEN',
    red_flags          JSONB        NOT NULL DEFAULT '[]'::jsonb,
    specialty_needed   VARCHAR(100) NOT NULL DEFAULT 'General Medicine',
    status             VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    escalation_level   INT          NOT NULL DEFAULT 0,
    escalate_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    accepted_at        TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    CONSTRAINT ck_case_urgency CHECK (urgency IN ('GREEN','AMBER','RED')),
    CONSTRAINT ck_case_status CHECK (status IN ('OPEN','ASSIGNED','IN_CONSULT','RESOLVED','CLOSED')),
    CONSTRAINT ck_case_age CHECK (patient_age IS NULL OR patient_age BETWEEN 0 AND 130)
);
CREATE INDEX ix_cases_reporter ON cases (reporter_id, created_at DESC);
CREATE INDEX ix_cases_doctor ON cases (assigned_doctor_id, status);
CREATE INDEX ix_cases_queue ON cases (status, urgency, created_at);
CREATE INDEX ix_cases_escalate ON cases (escalate_at) WHERE status = 'OPEN';

CREATE TABLE case_attachments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    UUID         NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    kind       VARCHAR(10)  NOT NULL,
    url        VARCHAR(500) NOT NULL,
    mime_type  VARCHAR(100),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_case_attachment_kind CHECK (kind IN ('PHOTO','VOICE'))
);
CREATE INDEX ix_case_attachments_case ON case_attachments (case_id);

-- Verified Answer Library: anonymised, doctor-verified answers that other health workers can search.
CREATE TABLE case_answers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id          UUID         NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
    doctor_id        UUID         NOT NULL REFERENCES users(id),
    specialty        VARCHAR(100) NOT NULL,
    question_summary TEXT         NOT NULL,
    answer           TEXT         NOT NULL,
    tags             VARCHAR(40)[] NOT NULL DEFAULT '{}',
    helpful_count    INT          NOT NULL DEFAULT 0,
    verified_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_case_answers_fts ON case_answers
    USING GIN (to_tsvector('simple', question_summary || ' ' || answer));

CREATE TABLE case_followups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    due_at       TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    outcome      VARCHAR(10),
    note         TEXT,
    CONSTRAINT ck_followup_outcome CHECK (outcome IS NULL OR outcome IN ('IMPROVED','SAME','WORSE'))
);
CREATE INDEX ix_case_followups_due ON case_followups (due_at) WHERE responded_at IS NULL;

-- Supabase exposes the public schema through its REST API with a public key. Turn on row level
-- security for every table with no policies, so only the backend's direct DB connection can read
-- or write. (The owning role bypasses RLS; the anon/authenticated API roles get nothing.)
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables
             WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
END $$;
