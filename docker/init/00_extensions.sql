-- Runs automatically the FIRST time the container starts (empty volume).
-- Enables pgvector so document_embedding.embedding VECTOR(1536) works.
CREATE EXTENSION IF NOT EXISTS vector;