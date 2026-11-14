CREATE TABLE IF NOT EXISTS coupon_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  family_id uuid NOT NULL,
  child_profile_id uuid NOT NULL,
  child_name varchar(40) NOT NULL,
  coupon_title varchar(80) NOT NULL,
  event_type varchar(16) NOT NULL CHECK (event_type IN ('issued', 'redeemed')),
  occurred_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS coupon_activity_events_family_time_idx
  ON coupon_activity_events (family_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS coupon_activity_events_child_time_idx
  ON coupon_activity_events (child_profile_id, occurred_at DESC);
