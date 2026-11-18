-- DEV/DEMO ONLY. Fictional people and SYNTHETIC cases. Idempotent. Run after seed-dev.sql.
-- Health worker login: kavitha.worker@medcord.dev / Passw0rd!Med
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (email, password_hash, display_name, status, account_type, preferred_language)
SELECT 'kavitha.worker@medcord.dev', crypt('Passw0rd!Med', gen_salt('bf', 10)), 'Kavitha (Health Worker)', 'ACTIVE', 'HEALTH_WORKER', 'ta'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'kavitha.worker@medcord.dev');

INSERT INTO professional_profiles (user_id, specialty, license_number, license_country, verification_status)
SELECT u.id, 'Community Health', 'CHW-DEMO-0001', 'IN', 'PENDING' FROM users u
WHERE lower(u.email) = 'kavitha.worker@medcord.dev' AND NOT EXISTS (SELECT 1 FROM professional_profiles p WHERE p.user_id = u.id);

INSERT INTO health_worker_profiles (user_id, region_id, organisation, languages)
SELECT u.id, r.id, 'Demo Primary Health Centre', '{ta,en}' FROM users u, regions r
WHERE lower(u.email) = 'kavitha.worker@medcord.dev' AND r.name = 'Thiruvallur Rural'
  AND NOT EXISTS (SELECT 1 FROM health_worker_profiles h WHERE h.user_id = u.id);

-- Seeded doctors go on duty.
INSERT INTO doctor_availability (user_id, on_duty, languages)
SELECT u.id, true, '{en,ta}' FROM users u
WHERE lower(u.email) IN ('priya.raman@medcord.dev','arjun.mehta@medcord.dev','sara.ahmed@medcord.dev','meera.nair@medcord.dev')
ON CONFLICT (user_id) DO UPDATE SET on_duty = true;

-- Three answered, synthetic cases so the Verified Answer Library and impact view have content.
DO $$
DECLARE
  hw uuid; region uuid; doc uuid; ch uuid; cid uuid; rec record;
BEGIN
  SELECT id INTO hw FROM users WHERE lower(email) = 'kavitha.worker@medcord.dev';
  SELECT id INTO region FROM regions WHERE name = 'Thiruvallur Rural';
  IF hw IS NULL OR EXISTS (SELECT 1 FROM cases WHERE reporter_id = hw) THEN RETURN; END IF;

  FOR rec IN SELECT * FROM (VALUES
    ('priya.raman@medcord.dev', 'Cardiology', 'AMBER', 52, 'male', 'Chest discomfort on climbing stairs for two weeks, no pain at rest',
     'Needs an ECG and a blood pressure and sugar check at the nearest centre this week. If pain starts at rest, lasts more than 15 minutes, or comes with sweating, treat as an emergency and transfer immediately.'),
    ('sara.ahmed@medcord.dev', 'Pediatrics', 'AMBER', 3, 'female', 'Fever for two days in a child, drinking well, playing',
     'Give paracetamol by weight, plenty of fluids, and review in 24 hours. Go to hospital if the child refuses fluids, is unusually sleepy, has fast breathing, a stiff neck or a rash that does not fade on pressure.'),
    ('meera.nair@medcord.dev', 'Dermatology', 'GREEN', 30, 'female', 'Itchy red rash on both forearms for four days, no fever',
     'Looks like contact dermatitis. Stop any new soap or cream, use a mild emollient and an antihistamine at night. See a doctor in person if it spreads, blisters, or does not improve in a week.')
  ) AS t(email, spec, urg, age, sex, cc, ans)
  LOOP
    SELECT id INTO doc FROM users WHERE lower(email) = rec.email;
    CONTINUE WHEN doc IS NULL;
    cid := gen_random_uuid();
    INSERT INTO channels (type, name, dm_key) VALUES ('CASE', 'case', 'case:' || cid) RETURNING id INTO ch;
    INSERT INTO dm_participants (channel_id, user_id) VALUES (ch, hw), (ch, doc);
    INSERT INTO cases (id, channel_id, reporter_id, assigned_doctor_id, village, region_id, patient_age, patient_sex, chief_complaint,
                       urgency, specialty_needed, status, created_at, accepted_at, resolved_at, sbar)
    VALUES (cid, ch, hw, doc, 'Demo Village', region, rec.age, rec.sex, rec.cc, rec.urg, rec.spec, 'RESOLVED',
            now() - interval '3 hours', now() - interval '170 minutes', now() - interval '2 hours',
            jsonb_build_object('situation', rec.age || 'y ' || rec.sex || ': ' || rec.cc, 'background', 'No vitals recorded.',
                               'assessment', 'Urgency ' || rec.urg || '. Automated triage, not a diagnosis.', 'recommendation', 'Route to ' || rec.spec || '.'));
    INSERT INTO messages (channel_id, author_id, body) VALUES (ch, hw, 'Case submitted: ' || rec.cc), (ch, doc, rec.ans);
    INSERT INTO case_answers (case_id, doctor_id, specialty, question_summary, answer, helpful_count)
    VALUES (cid, doc, rec.spec, rec.age || 'y ' || rec.sex || ': ' || rec.cc, rec.ans, 2);
  END LOOP;
END $$;
