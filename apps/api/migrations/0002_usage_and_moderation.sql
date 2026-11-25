-- Daily usage per user (limits and cost) and moderation events (CLAUDE.md §5.5).

-- migrate:up
CREATE TABLE usage_daily (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day        date NOT NULL,                  -- calendar day in America/Sao_Paulo
  tokens_in  integer NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out integer NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_cents numeric(12, 4) NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),  -- centavos de real (BRL)
  PRIMARY KEY (user_id, day)
);

-- The monthly budget check sums one month of usage for everybody.
CREATE INDEX usage_daily_day_idx ON usage_daily (day);

CREATE TABLE moderation_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users (id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages (id) ON DELETE SET NULL,
  direction  text NOT NULL CHECK (direction IN ('in', 'out')),
  category   text NOT NULL,
  action     text NOT NULL,                  -- e.g. 'blocked', 'replaced'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_events_created_idx ON moderation_events (created_at);

-- migrate:down
DROP TABLE moderation_events;
DROP TABLE usage_daily;
