-- Volunteer dispatch: anyone posts a help request, a volunteer claims it and they talk in a direct room.
CREATE TABLE dispatch_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID          NOT NULL REFERENCES users(id),
    volunteer_id UUID          REFERENCES users(id),
    kind         VARCHAR(12)   NOT NULL,
    urgency      VARCHAR(8)    NOT NULL DEFAULT 'NORMAL',
    title        VARCHAR(100)  NOT NULL,
    details      VARCHAR(600),
    area         VARCHAR(120),
    status       VARCHAR(10)   NOT NULL DEFAULT 'OPEN',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    claimed_at   TIMESTAMPTZ,
    done_at      TIMESTAMPTZ,
    CONSTRAINT ck_dispatch_kind CHECK (kind IN ('TRANSPORT','MEDICINE','VISIT','FOOD','OTHER')),
    CONSTRAINT ck_dispatch_urgency CHECK (urgency IN ('NORMAL','URGENT')),
    CONSTRAINT ck_dispatch_status CHECK (status IN ('OPEN','CLAIMED','DONE','CANCELLED'))
);
CREATE INDEX ix_dispatch_status ON dispatch_requests (status, urgency, created_at DESC);
CREATE INDEX ix_dispatch_requester ON dispatch_requests (requester_id);
CREATE INDEX ix_dispatch_volunteer ON dispatch_requests (volunteer_id);

-- Peer-support check-ins: a quick "how are you today", shared with people in your communities, who can send a kind word.
CREATE TABLE checkins (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mood       SMALLINT     NOT NULL,
    note       VARCHAR(200),
    shared     BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_checkin_mood CHECK (mood BETWEEN 1 AND 5)
);
CREATE INDEX ix_checkins_user ON checkins (user_id, created_at DESC);

CREATE TABLE checkin_cheers (
    checkin_id UUID        NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    from_user  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (checkin_id, from_user)
);

ALTER TABLE dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_cheers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON dispatch_requests, checkins, checkin_cheers FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON dispatch_requests, checkins, checkin_cheers FROM authenticated;
    END IF;
END $$;
