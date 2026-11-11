ALTER TABLE "family_arcade_settings"
  DROP CONSTRAINT IF EXISTS "family_arcade_settings_daily_limit_check";

ALTER TABLE "family_arcade_settings"
  ADD CONSTRAINT "family_arcade_settings_daily_limit_check"
  CHECK ("pacman_daily_play_limit" BETWEEN 0 AND 10);

UPDATE "child_profiles" AS child
SET
  "show_pacman" = false,
  "show_word_defense" = false,
  "updated_at" = now()
FROM "family_arcade_settings" AS arcade
WHERE arcade."family_id" = child."family_id"
  AND arcade."pacman_enabled" = false
  AND (child."show_pacman" IS DISTINCT FROM false
    OR child."show_word_defense" IS DISTINCT FROM false);
