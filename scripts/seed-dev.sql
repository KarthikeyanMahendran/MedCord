-- DEV ONLY. Fictional people; fake license numbers. Idempotent. Usage: make seed
-- All accounts use password: Passw0rd!Med   (bcrypt via pgcrypto, compatible with Spring BCrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH seed(email, name, status, role, specialty, lic, country, vstatus, bio) AS (VALUES
 ('admin@medcord.dev',        'Platform Admin',        'ACTIVE',    'ADMIN', 'Administration',    'ADM-0001',  'IN', 'APPROVED', 'MedCord platform administrator.'),
 ('priya.raman@medcord.dev',  'Dr. Priya Raman',       'ACTIVE',    'USER',  'Cardiology',        'TN-CARD-48211', 'IN', 'APPROVED', 'Interventional cardiologist, 12 yrs.'),
 ('arjun.mehta@medcord.dev',  'Dr. Arjun Mehta',       'ACTIVE',    'USER',  'Neurology',         'MH-NEU-33902',  'IN', 'APPROVED', 'Stroke and epilepsy care.'),
 ('sara.ahmed@medcord.dev',   'Dr. Sara Ahmed',        'ACTIVE',    'USER',  'Pediatrics',        'GMC-7345512',   'GB', 'APPROVED', 'Paediatric emergency medicine.'),
 ('liam.oconnor@medcord.dev', 'Dr. Liam O''Connor',    'ACTIVE',    'USER',  'Radiology',         'IMC-229871',    'IE', 'APPROVED', 'Musculoskeletal radiology.'),
 ('meera.nair@medcord.dev',   'Dr. Meera Nair',        'ACTIVE',    'USER',  'Dermatology',       'KL-DER-90417',  'IN', 'APPROVED', 'Clinical dermatology.'),
 ('carlos.vega@medcord.dev',  'Dr. Carlos Vega',       'ACTIVE',    'USER',  'Anesthesiology',    'MX-ANE-55120',  'MX', 'APPROVED', 'Perioperative medicine.'),
 ('nina.kapoor@medcord.dev',  'Nina Kapoor, RN',       'PENDING',   'USER',  'Critical Care Nursing','RN-DL-77231','IN', 'PENDING',  'ICU nurse awaiting verification.'),
 ('omar.haddad@medcord.dev',  'Dr. Omar Haddad',       'PENDING',   'USER',  'Orthopedics',       'JMA-118820',    'JO', 'PENDING',  'Awaiting license verification.'),
 ('rejected.user@medcord.dev','Test Rejected',         'PENDING',   'USER',  'General Practice',  'XX-REJ-0001',   'IN', 'REJECTED', 'License could not be verified.'),
 ('suspended.user@medcord.dev','Test Suspended',       'SUSPENDED', 'USER',  'General Practice',  'XX-SUS-0001',   'IN', 'APPROVED', 'Suspended for policy violation.')
), ins_u AS (
  INSERT INTO users (email, password_hash, display_name, status, platform_role)
  SELECT email, crypt('Passw0rd!Med', gen_salt('bf', 10)), name, status, role FROM seed
  ON CONFLICT ((lower(email))) DO NOTHING
  RETURNING id, email
)
INSERT INTO professional_profiles (user_id, specialty, license_number, license_country, verification_status, verified_at, bio)
SELECT u.id, s.specialty, s.lic, s.country, s.vstatus,
       CASE WHEN s.vstatus='APPROVED' THEN now() END, s.bio
FROM ins_u u JOIN seed s ON lower(s.email)=lower(u.email)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Communities (DEV ONLY): owner + roles + channels + members. Idempotent by slug.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.seed_community(p_slug text, p_name text, p_desc text, p_tag text, p_vis text, p_owner text, p_members text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE cid uuid; oid uuid; r_owner uuid; r_admin uuid; r_mod uuid; r_member uuid; mid uuid; m text;
BEGIN
  IF EXISTS (SELECT 1 FROM communities WHERE slug = p_slug) THEN RETURN; END IF;
  SELECT id INTO oid FROM users WHERE lower(email) = lower(p_owner);
  INSERT INTO communities (name, slug, description, specialty_tag, visibility, owner_id)
    VALUES (p_name, p_slug, p_desc, p_tag, p_vis, oid) RETURNING id INTO cid;

  INSERT INTO roles (community_id, name, position, system_key) VALUES (cid,'Owner',0,'OWNER') RETURNING id INTO r_owner;
  INSERT INTO roles (community_id, name, position, system_key) VALUES (cid,'Admin',1,'ADMIN') RETURNING id INTO r_admin;
  INSERT INTO roles (community_id, name, position, system_key) VALUES (cid,'Moderator',2,'MODERATOR') RETURNING id INTO r_mod;
  INSERT INTO roles (community_id, name, position, system_key) VALUES (cid,'Member',3,'MEMBER') RETURNING id INTO r_member;
  INSERT INTO role_permissions (role_id, permission)
    SELECT r, p FROM (VALUES (r_owner),(r_admin)) o(r), unnest(ARRAY['MANAGE_COMMUNITY','MANAGE_CHANNELS','MANAGE_ROLES','MANAGE_MEMBERS','CREATE_INVITE','SEND_MESSAGES','POST_ANNOUNCEMENTS','MODERATE_MESSAGES']) p;
  INSERT INTO role_permissions (role_id, permission) SELECT r_mod, unnest(ARRAY['MODERATE_MESSAGES','MANAGE_MEMBERS','SEND_MESSAGES','CREATE_INVITE']);
  INSERT INTO role_permissions (role_id, permission) VALUES (r_member, 'SEND_MESSAGES');

  INSERT INTO channels (community_id, name, topic, type, position) VALUES
    (cid,'general','General discussion','TEXT',0), (cid,'announcements','Official announcements','ANNOUNCEMENT',1),
    (cid,'case-discussions','Anonymised case discussions','TEXT',2), (cid,'journal-club','Papers and reviews','TEXT',3);

  INSERT INTO memberships (community_id, user_id) VALUES (cid, oid) RETURNING id INTO mid;
  INSERT INTO membership_roles VALUES (mid, r_owner), (mid, r_member);
  FOREACH m IN ARRAY p_members LOOP
    INSERT INTO memberships (community_id, user_id) SELECT cid, id FROM users WHERE lower(email)=lower(split_part(m,':',1)) RETURNING id INTO mid;
    INSERT INTO membership_roles VALUES (mid, r_member);
    IF split_part(m,':',2) = 'mod' THEN INSERT INTO membership_roles VALUES (mid, r_mod); END IF;
    IF split_part(m,':',2) = 'admin' THEN INSERT INTO membership_roles VALUES (mid, r_admin); END IF;
  END LOOP;
END $$;

SELECT pg_temp.seed_community('cardiology-collective','Cardiology Collective','Interventional, imaging and heart-failure discussion.','Cardiology','PUBLIC','priya.raman@medcord.dev',
  ARRAY['arjun.mehta@medcord.dev:admin','sara.ahmed@medcord.dev:mod','liam.oconnor@medcord.dev','meera.nair@medcord.dev']);
SELECT pg_temp.seed_community('emergency-medicine-hub','Emergency Medicine Hub','Trauma, triage and resuscitation protocols.','Emergency','PUBLIC','sara.ahmed@medcord.dev',
  ARRAY['priya.raman@medcord.dev','carlos.vega@medcord.dev:mod','arjun.mehta@medcord.dev']);
SELECT pg_temp.seed_community('radiology-readers-private','Radiology Readers','Private reading group for radiologists.','Radiology','PRIVATE','liam.oconnor@medcord.dev',
  ARRAY['priya.raman@medcord.dev']);
