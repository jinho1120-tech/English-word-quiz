CREATE TABLE IF NOT EXISTS "family_arcade_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "pacman_enabled" boolean DEFAULT false NOT NULL,
  "pacman_daily_play_limit" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "family_arcade_settings_daily_limit_check" CHECK ("pacman_daily_play_limit" BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS "family_arcade_settings_family_unique"
  ON "family_arcade_settings" ("family_id");

CREATE TABLE IF NOT EXISTS "child_pacman_daily_plays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "play_date" varchar(10) NOT NULL,
  "plays_used" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "child_pacman_daily_plays_count_check" CHECK ("plays_used" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "child_pacman_daily_plays_child_date_unique"
  ON "child_pacman_daily_plays" ("child_profile_id", "play_date");
