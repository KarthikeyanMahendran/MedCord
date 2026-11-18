-- Idempotent: creates role + database for MedCord only. Usage: make db
SELECT format('CREATE ROLE medcord_app LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medcord_app') \gexec
SELECT 'CREATE DATABASE medcord OWNER medcord_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'medcord') \gexec
