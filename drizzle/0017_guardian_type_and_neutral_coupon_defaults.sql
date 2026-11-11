ALTER TABLE "user"
  ADD COLUMN "guardian_type" text DEFAULT 'guardian' NOT NULL;

UPDATE "user"
SET "guardian_type" = 'parent'
WHERE "name" IN ('아빠', '엄마');

ALTER TABLE "user"
  ADD CONSTRAINT "user_guardian_type_check"
  CHECK ("guardian_type" IN ('parent', 'guardian'));

-- Existing families keep their current coupon catalog unchanged.
-- Only families created after this migration receive the new neutral defaults.
UPDATE "family_settings"
SET "coupon_defaults_seeded" = true,
    "updated_at" = now()
WHERE "coupon_defaults_seeded" = false;
