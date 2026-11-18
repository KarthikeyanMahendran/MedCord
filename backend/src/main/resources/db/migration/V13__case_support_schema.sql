-- Supporting schema for Rural Case Rooms: reference data, health-worker profiles, case timeline,
-- AI audit log, notifications, answer votes and impact views. DEMO DATA ONLY (see ADR 0005).

-- Regions (villages / districts) for the impact heatmap and routing.
CREATE TABLE regions (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name     VARCHAR(120) NOT NULL,
    district VARCHAR(120) NOT NULL,
    state    VARCHAR(120) NOT NULL,
    lat      NUMERIC(9,6),
    lng      NUMERIC(9,6),
    CONSTRAINT ux_regions UNIQUE (name, district, state)
);

CREATE TABLE health_worker_profiles (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    region_id      UUID REFERENCES regions(id),
    organisation   VARCHAR(160),
    training_level VARCHAR(40) NOT NULL DEFAULT 'CHW',
    languages      VARCHAR(10)[] NOT NULL DEFAULT '{en}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Specialty taxonomy used by AI structuring and routing.
CREATE TABLE specialties (
    code     VARCHAR(40) PRIMARY KEY,
    name     VARCHAR(100) NOT NULL UNIQUE,
    keywords VARCHAR(40)[] NOT NULL DEFAULT '{}'
);

-- Deterministic red-flag rules. The safety net escalates; it never diagnoses.
CREATE TABLE red_flag_rules (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code           VARCHAR(40) NOT NULL UNIQUE,
    label          VARCHAR(120) NOT NULL,
    keywords       VARCHAR(60)[] NOT NULL,
    specialty_code VARCHAR(40) REFERENCES specialties(code),
    advice         VARCHAR(300) NOT NULL,
    active         BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE cases ADD COLUMN region_id UUID REFERENCES regions(id);
CREATE INDEX ix_cases_region ON cases (region_id, created_at DESC);

-- Append-only timeline of everything that happens to a case.
CREATE TABLE case_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    actor_id   UUID        REFERENCES users(id),
    type       VARCHAR(30) NOT NULL,
    payload    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_case_event_type CHECK (type IN
        ('SUBMITTED','STRUCTURED','ROUTED','ESCALATED','ACCEPTED','ANSWERED','RESOLVED','FOLLOWUP_SENT','FOLLOWUP_DONE','REOPENED'))
);
CREATE INDEX ix_case_events_case ON case_events (case_id, created_at);

-- Audit log of AI calls: what was asked, what came back, how long it took.
CREATE TABLE case_ai_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL,
    model       VARCHAR(60),
    output      JSONB,
    latency_ms  INT,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_case_ai_kind CHECK (kind IN ('STRUCTURE','TRANSLATE','RED_FLAG','SUMMARY'))
);
CREATE INDEX ix_case_ai_runs_case ON case_ai_runs (case_id, created_at);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       VARCHAR(30)  NOT NULL,
    case_id    UUID         REFERENCES cases(id) ON DELETE CASCADE,
    title      VARCHAR(160) NOT NULL,
    body       VARCHAR(500),
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE case_answer_votes (
    answer_id  UUID NOT NULL REFERENCES case_answers(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (answer_id, user_id)
);

-- Impact views (security_invoker so they never bypass access rules).
CREATE VIEW v_case_impact_daily WITH (security_invoker = true) AS
SELECT date_trunc('day', created_at)::date AS day,
       count(*)                                                        AS cases,
       count(*) FILTER (WHERE urgency = 'RED')                         AS red_cases,
       count(*) FILTER (WHERE status IN ('RESOLVED','CLOSED'))         AS resolved,
       round(avg(extract(epoch FROM (accepted_at - created_at)) / 60)
             FILTER (WHERE accepted_at IS NOT NULL)::numeric, 1)       AS avg_minutes_to_accept
FROM cases GROUP BY 1;

CREATE VIEW v_region_heat WITH (security_invoker = true) AS
SELECT r.id AS region_id, r.name, r.district, r.state, r.lat, r.lng,
       count(c.id)                                         AS cases,
       count(c.id) FILTER (WHERE c.urgency = 'RED')        AS red_cases,
       count(c.id) FILTER (WHERE c.status = 'OPEN')        AS open_cases
FROM regions r LEFT JOIN cases c ON c.region_id = r.id
GROUP BY r.id;

-- Reference data.
INSERT INTO specialties (code, name, keywords) VALUES
 ('GENERAL',    'General Medicine',  '{fever,cough,weakness,pain}'),
 ('CARDIO',     'Cardiology',        '{chest,palpitation,heart,bp}'),
 ('NEURO',      'Neurology',         '{seizure,stroke,headache,paralysis}'),
 ('PEDIATRICS', 'Pediatrics',        '{child,infant,baby,newborn}'),
 ('OBGYN',      'Obstetrics & Gynaecology', '{pregnant,delivery,bleeding,labour}'),
 ('DERM',       'Dermatology',       '{rash,skin,itch,wound}'),
 ('ORTHO',      'Orthopaedics',      '{fracture,bone,joint,fall}'),
 ('RESP',       'Pulmonology',       '{breathing,wheeze,asthma,cough}'),
 ('EMERGENCY',  'Emergency Medicine','{unconscious,bleeding,poison,burn}'),
 ('PSYCH',      'Psychiatry',        '{anxiety,depression,suicidal}'),
 ('OPHTHAL',    'Ophthalmology',     '{eye,vision,red-eye}'),
 ('ENT',        'ENT',               '{ear,throat,nose,hearing}');

INSERT INTO red_flag_rules (code, label, keywords, specialty_code, advice) VALUES
 ('CHEST_PAIN',     'Chest pain / possible cardiac event', '{chest pain,crushing,left arm}', 'CARDIO',    'Keep patient still and arrange transport now. Do not wait for a reply.'),
 ('STROKE',         'Possible stroke',                     '{face droop,slurred,one side weak,paralysis}', 'NEURO', 'Note the time symptoms began and arrange transport now.'),
 ('SEVERE_BLEEDING','Severe bleeding',                     '{heavy bleeding,bleeding heavily,haemorrhage,hemorrhage}', 'EMERGENCY', 'Apply firm pressure and arrange transport now.'),
 ('BREATHING',      'Severe breathing difficulty',         '{cannot breathe,gasping,blue lips,severe breathlessness}', 'RESP', 'Sit patient upright and arrange transport now.'),
 ('UNCONSCIOUS',    'Unconscious / unresponsive',          '{unconscious,unresponsive,not waking,collapsed}', 'EMERGENCY', 'Check breathing, place in recovery position and arrange transport now.'),
 ('SEIZURE',        'Active or prolonged seizure',         '{seizure,convulsion,fits}', 'NEURO',    'Protect from injury; do not put anything in the mouth; arrange transport.'),
 ('PREG_BLEED',     'Pregnancy with bleeding or severe pain', '{pregnant bleeding,antepartum,severe abdominal pain pregnant}', 'OBGYN', 'Lie patient on left side and arrange transport now.'),
 ('INFANT_FEVER',   'Fever in a newborn',                  '{newborn fever,infant fever,baby not feeding}', 'PEDIATRICS', 'Arrange urgent in-person assessment.'),
 ('POISONING',      'Poisoning / ingestion',               '{poison,swallowed,overdose,pesticide}', 'EMERGENCY', 'Do not induce vomiting; arrange transport and bring the container.'),
 ('SUICIDAL',       'Self-harm risk',                      '{suicidal,want to die,self harm}', 'PSYCH', 'Stay with the person and contact a doctor immediately.');

INSERT INTO regions (name, district, state, lat, lng) VALUES
 ('Thiruvallur Rural',  'Thiruvallur',  'Tamil Nadu', 13.143400, 79.908600),
 ('Kancheepuram Rural', 'Kancheepuram', 'Tamil Nadu', 12.834200, 79.703600),
 ('Villupuram Rural',   'Villupuram',   'Tamil Nadu', 11.939900, 79.493600),
 ('Wayanad Hills',      'Wayanad',      'Kerala',     11.685400, 76.131900),
 ('Koraput Tribal',     'Koraput',      'Odisha',     18.811900, 82.710500);

-- Lock everything down for Supabase's public REST API; the backend's own DB role is unaffected.
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables
             WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    END IF;
END $$;
