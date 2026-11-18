-- AI Knowledge Base Chunks & Search Index
CREATE TABLE ai_knowledge_chunks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id   UUID REFERENCES communities(id) ON DELETE CASCADE,
    channel_id     UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    thread_id      UUID REFERENCES threads(id) ON DELETE SET NULL,
    author_id      UUID NOT NULL REFERENCES users(id),
    author_name    VARCHAR(120),
    channel_name   VARCHAR(64),
    community_name VARCHAR(120),
    content        TEXT NOT NULL,
    message_ids    TEXT NOT NULL,
    embedding      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_ai_chunks_access ON ai_knowledge_chunks (community_id, channel_id, created_at DESC);
CREATE INDEX ix_ai_chunks_fts ON ai_knowledge_chunks USING GIN (to_tsvector('simple', content));
