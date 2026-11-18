-- Append-only audit of admin licence decisions.
CREATE TABLE verification_decisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    decided_by  UUID        NOT NULL REFERENCES users(id),
    decision    VARCHAR(20) NOT NULL,
    reason      TEXT,
    decided_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_vd_decision CHECK (decision IN ('APPROVED','REJECTED'))
);
CREATE INDEX ix_vd_user ON verification_decisions (user_id, decided_at DESC);
