-- Zobbo indexer schema. Applied automatically on indexer start (idempotent).

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,          -- Soroban RPC event id (unique, sortable)
  type         TEXT NOT NULL,             -- 'tip' | 'register'
  handle       TEXT NOT NULL,
  from_address TEXT,                      -- tipper (tip) or owner (register)
  amount       NUMERIC(40, 0),            -- raw token units (tip only)
  message      TEXT,                      -- tip message (tip only)
  ledger       BIGINT NOT NULL,
  closed_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS events_type_handle_id_idx ON events (type, handle, id DESC);
CREATE INDEX IF NOT EXISTS events_type_id_idx ON events (type, id DESC);

-- Single row holding the resume point.
CREATE TABLE IF NOT EXISTS indexer_state (
  contract_id TEXT PRIMARY KEY,
  cursor      TEXT,
  ledger      BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
