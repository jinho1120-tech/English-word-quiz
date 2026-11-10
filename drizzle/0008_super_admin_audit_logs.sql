CREATE TABLE IF NOT EXISTS "super_admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" text NOT NULL,
  "actor_email" varchar(320) NOT NULL,
  "action" varchar(80) NOT NULL,
  "target_family_id" uuid NOT NULL,
  "target_record_id" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "super_admin_audit_family_created_idx"
  ON "super_admin_audit_logs" ("target_family_id", "created_at");
