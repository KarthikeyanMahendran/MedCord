-- Care Fund: a doctor or health worker raises money for a patient inside a community; members contribute small amounts.
CREATE TABLE fundraisers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id  UUID         NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    case_id       UUID         REFERENCES cases(id) ON DELETE SET NULL,
    organiser_id  UUID         NOT NULL REFERENCES users(id),
    title         VARCHAR(120) NOT NULL,
    story         VARCHAR(2000) NOT NULL,
    beneficiary   VARCHAR(80)  NOT NULL,
    need          VARCHAR(20)  NOT NULL,
    goal_amount   BIGINT       NOT NULL,
    raised_amount BIGINT       NOT NULL DEFAULT 0,
    supporters    INT          NOT NULL DEFAULT 0,
    status        VARCHAR(20)  NOT NULL,
    verified_by   UUID         REFERENCES users(id),
    verified_at   TIMESTAMPTZ,
    reject_reason VARCHAR(300),
    deadline      DATE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    closed_at     TIMESTAMPTZ,
    CONSTRAINT ck_fund_need CHECK (need IN ('MEDICINE','SURGERY','TESTS','TRANSPORT','OTHER')),
    CONSTRAINT ck_fund_status CHECK (status IN ('PENDING','ACTIVE','FUNDED','CLOSED','REJECTED')),
    CONSTRAINT ck_fund_goal CHECK (goal_amount BETWEEN 100 AND 5000000)
);
CREATE INDEX ix_fundraisers_community ON fundraisers (community_id, status, created_at DESC);
CREATE INDEX ix_fundraisers_organiser ON fundraisers (organiser_id);

CREATE TABLE fundraiser_contributions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fundraiser_id UUID         NOT NULL REFERENCES fundraisers(id) ON DELETE CASCADE,
    donor_id      UUID         NOT NULL REFERENCES users(id),
    amount        BIGINT       NOT NULL,
    anonymous     BOOLEAN      NOT NULL DEFAULT false,
    message       VARCHAR(200),
    payment_ref   VARCHAR(40)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_contribution_amount CHECK (amount BETWEEN 10 AND 100000)
);
CREATE INDEX ix_contributions_fund ON fundraiser_contributions (fundraiser_id, created_at DESC);

CREATE TABLE fundraiser_updates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fundraiser_id UUID          NOT NULL REFERENCES fundraisers(id) ON DELETE CASCADE,
    author_id     UUID          NOT NULL REFERENCES users(id),
    kind          VARCHAR(12)   NOT NULL DEFAULT 'UPDATE',
    body          VARCHAR(1000) NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_update_kind CHECK (kind IN ('UPDATE','FUNDS_USED'))
);
CREATE INDEX ix_fund_updates ON fundraiser_updates (fundraiser_id, created_at DESC);

SET LOCAL lock_timeout = '20s';
ALTER TABLE notifications ADD COLUMN fundraiser_id UUID;

ALTER TABLE fundraisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraiser_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraiser_updates ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON fundraisers, fundraiser_contributions, fundraiser_updates FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON fundraisers, fundraiser_contributions, fundraiser_updates FROM authenticated;
    END IF;
END $$;
