-- Full-text search over message bodies. 'simple' config: no language-specific stemming (multilingual, medical terms).
CREATE INDEX ix_messages_fts ON messages USING GIN (to_tsvector('simple', body));
