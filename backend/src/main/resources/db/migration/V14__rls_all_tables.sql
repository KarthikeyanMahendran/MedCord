-- Supabase exposes the public schema through a public REST API. Tables created after V12/V13 (e.g. calls)
-- would otherwise be readable with the public key. Enable row level security (no policies) on every table;
-- the backend's own DB role is unaffected. Idempotent.
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables
             WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
END $$;
