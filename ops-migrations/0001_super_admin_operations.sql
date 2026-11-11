BEGIN;

CREATE TABLE IF NOT EXISTS service_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL,
  family_id uuid,
  actor_user_id text,
  action varchar(100) NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  status varchar(24) NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_usage_events_provider_created_idx
  ON service_usage_events (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS service_usage_events_family_provider_created_idx
  ON service_usage_events (family_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS service_usage_events_created_idx
  ON service_usage_events (created_at DESC);

CREATE TABLE IF NOT EXISTS service_usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL,
  family_id uuid,
  monthly_request_limit integer CHECK (monthly_request_limit IS NULL OR monthly_request_limit >= 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_by_user_id text,
  updated_by_email varchar(320),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_usage_limits_global_provider_unique
  ON service_usage_limits (provider) WHERE family_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_usage_limits_family_provider_unique
  ON service_usage_limits (provider, family_id) WHERE family_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_monthly_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL,
  billing_month date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency varchar(3) NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW', 'USD')),
  usage_summary varchar(500),
  note varchar(500),
  updated_by_user_id text NOT NULL,
  updated_by_email varchar(320) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_monthly_costs ADD COLUMN IF NOT EXISTS usage_summary varchar(500);

CREATE UNIQUE INDEX IF NOT EXISTS provider_monthly_costs_provider_month_unique
  ON provider_monthly_costs (provider, billing_month);

CREATE TABLE IF NOT EXISTS super_admin_system_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text NOT NULL,
  actor_email varchar(320) NOT NULL,
  action varchar(80) NOT NULL,
  target_type varchar(40) NOT NULL DEFAULT 'system',
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS super_admin_system_audit_created_idx
  ON super_admin_system_audit_logs (created_at DESC);

COMMIT;
