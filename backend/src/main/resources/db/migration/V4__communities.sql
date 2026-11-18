CREATE TABLE communities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    slug          VARCHAR(120) NOT NULL UNIQUE,
    description   VARCHAR(1000),
    specialty_tag VARCHAR(100),
    visibility    VARCHAR(10)  NOT NULL DEFAULT 'PUBLIC',
    owner_id      UUID         NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_community_visibility CHECK (visibility IN ('PUBLIC','PRIVATE'))
);
CREATE INDEX ix_communities_owner ON communities (owner_id);

CREATE TABLE channels (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID         NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name         VARCHAR(80)  NOT NULL,
    topic        VARCHAR(500),
    type         VARCHAR(15)  NOT NULL DEFAULT 'TEXT',
    position     INT          NOT NULL DEFAULT 0,
    archived     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_channel_type CHECK (type IN ('TEXT','ANNOUNCEMENT'))
);
CREATE UNIQUE INDEX ux_channels_name ON channels (community_id, lower(name));

CREATE TABLE roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name         VARCHAR(50) NOT NULL,
    position     INT         NOT NULL,
    system_key   VARCHAR(20),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_role_system CHECK (system_key IS NULL OR system_key IN ('OWNER','ADMIN','MODERATOR','MEMBER'))
);
CREATE UNIQUE INDEX ux_roles_name ON roles (community_id, lower(name));

CREATE TABLE role_permissions (
    role_id    UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission VARCHAR(40) NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE TABLE memberships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ux_membership UNIQUE (community_id, user_id)
);
CREATE INDEX ix_memberships_user ON memberships (user_id);

CREATE TABLE membership_roles (
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    code         VARCHAR(16) NOT NULL UNIQUE,
    created_by   UUID        NOT NULL REFERENCES users(id),
    expires_at   TIMESTAMPTZ,
    max_uses     INT,
    uses         INT         NOT NULL DEFAULT 0,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_bans (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by    UUID        NOT NULL REFERENCES users(id),
    reason       VARCHAR(500),
    banned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ux_ban UNIQUE (community_id, user_id)
);
