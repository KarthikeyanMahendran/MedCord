CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(100) NOT NULL,
    display_name   VARCHAR(100) NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    platform_role  VARCHAR(20)  NOT NULL DEFAULT 'USER',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_status CHECK (status IN ('PENDING','ACTIVE','SUSPENDED')),
    CONSTRAINT ck_users_role CHECK (platform_role IN ('USER','ADMIN'))
);
CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));

CREATE TABLE professional_profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialty           VARCHAR(100) NOT NULL,
    license_number      VARCHAR(64)  NOT NULL,
    license_country     VARCHAR(2)   NOT NULL,
    verification_status VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    verified_at         TIMESTAMPTZ,
    bio                 TEXT,
    avatar_url          VARCHAR(500),
    CONSTRAINT ck_profile_verification CHECK (verification_status IN ('PENDING','APPROVED','REJECTED')),
    CONSTRAINT ux_profile_license UNIQUE (license_country, license_number)
);
