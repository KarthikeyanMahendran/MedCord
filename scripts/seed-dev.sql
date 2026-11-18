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
