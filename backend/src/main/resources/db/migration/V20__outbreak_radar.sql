-- Outbreak Radar: deterministic cluster detection over the cases already collected.
-- A cluster = N or more similar cases (same syndrome) in the same region within a rolling window.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_cases_region_created ON cases (region_id, created_at DESC) WHERE region_id IS NOT NULL;

CREATE TABLE outbreak_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id       UUID         NOT NULL REFERENCES regions(id),
    syndrome        VARCHAR(30)  NOT NULL,
    severity        VARCHAR(10)  NOT NULL DEFAULT 'WATCH',
    status          VARCHAR(15)  NOT NULL DEFAULT 'OPEN',
    case_count      INT          NOT NULL DEFAULT 0,
    red_count       INT          NOT NULL DEFAULT 0,
    first_case_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_case_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_demo         BOOLEAN      NOT NULL DEFAULT false,
    note            VARCHAR(500),
    acknowledged_by UUID         REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_outbreak_severity CHECK (severity IN ('WATCH','ALERT')),
    CONSTRAINT ck_outbreak_status CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED'))
);
-- At most one live alert per region and syndrome.
CREATE UNIQUE INDEX ux_outbreak_live ON outbreak_alerts (region_id, syndrome) WHERE status <> 'RESOLVED';
CREATE INDEX ix_outbreak_status ON outbreak_alerts (status, updated_at DESC);

CREATE TABLE outbreak_alert_cases (
    alert_id UUID NOT NULL REFERENCES outbreak_alerts(id) ON DELETE CASCADE,
    case_id  UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    PRIMARY KEY (alert_id, case_id)
);
CREATE INDEX ix_outbreak_alert_cases_case ON outbreak_alert_cases (case_id);

-- Supabase exposes the public schema through a REST API: keep these tables private to the backend.
ALTER TABLE outbreak_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbreak_alert_cases ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON outbreak_alerts, outbreak_alert_cases FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON outbreak_alerts, outbreak_alert_cases FROM authenticated;
    END IF;
END $$;
