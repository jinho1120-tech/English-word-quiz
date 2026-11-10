ALTER TABLE "family_arcade_settings"
  ADD COLUMN IF NOT EXISTS "pacman_min_daily_questions" integer DEFAULT 10 NOT NULL,
  ADD COLUMN IF NOT EXISTS "pacman_require_no_wrong_words" boolean DEFAULT true NOT NULL;

ALTER TABLE "family_arcade_settings"
  ADD CONSTRAINT "family_arcade_settings_min_questions_check"
  CHECK ("pacman_min_daily_questions" BETWEEN 1 AND 100);
