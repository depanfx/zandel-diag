-- Zandel Diag schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('superadmin', 'technician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE device_type AS ENUM ('android', 'iphone', 'ipad', 'laptop_windows', 'laptop_linux', 'macbook');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE test_status AS ENUM ('pass', 'fail', 'skip', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  role          user_role NOT NULL DEFAULT 'technician',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMP,
  is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type device_type NOT NULL,
  opened_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMP,
  is_guest    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS session_results (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  test_key   VARCHAR(100) NOT NULL,
  test_label VARCHAR(200) NOT NULL,
  status     test_status NOT NULL,
  detail     TEXT,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);
