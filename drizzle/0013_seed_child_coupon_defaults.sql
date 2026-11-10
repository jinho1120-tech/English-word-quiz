-- Copy any family-level default coupons to each child that does not already
-- have a child-scoped coupon with the same title. This is safe to rerun and
-- repairs families whose seven defaults were seeded after migration 0011.
INSERT INTO "coupon_types" (
  "family_id", "child_profile_id", "title", "description",
  "coupon_kind", "draw_weight", "is_active", "created_at", "updated_at"
)
SELECT
  legacy."family_id", child."id", legacy."title", legacy."description",
  legacy."coupon_kind", legacy."draw_weight", legacy."is_active",
  legacy."created_at", legacy."updated_at"
FROM "coupon_types" AS legacy
INNER JOIN "child_profiles" AS child
  ON child."family_id" = legacy."family_id"
WHERE legacy."child_profile_id" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "coupon_types" AS existing
    WHERE existing."child_profile_id" = child."id"
      AND existing."title" = legacy."title"
  );
