-- Users, conversations and messages (CLAUDE.md §5.5).
-- Deleting a user deletes their conversations and messages (ON DELETE CASCADE) — LGPD.

-- migrate:up
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid     text NOT NULL UNIQUE,          -- Firebase UID (the "sub" claim of the ID token)
  email        text,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Nova conversa' CHECK (char_length(title) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The sidebar lists a user's conversations, most recent first.
CREATE INDEX conversations_user_updated_idx ON conversations (user_id, updated_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text NOT NULL,
  model           text,
  route_reason    text,
  tokens_in       integer CHECK (tokens_in >= 0),
  tokens_out      integer CHECK (tokens_out >= 0),
  latency_ms      integer CHECK (latency_ms >= 0),
  first_token_ms  integer CHECK (first_token_ms >= 0),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- History of one conversation, in order.
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);

-- migrate:down
DROP TABLE messages;
DROP TABLE conversations;
DROP TABLE users;
DROP EXTENSION IF EXISTS vector;
