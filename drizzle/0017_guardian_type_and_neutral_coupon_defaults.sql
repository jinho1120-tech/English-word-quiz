ALTER TABLE "user"
  ADD COLUMN "guardian_type" text DEFAULT 'guardian' NOT NULL;

UPDATE "user"
SET "guardian_type" = 'parent'
WHERE "name" IN ('아빠', '엄마');

ALTER TABLE "user"
  ADD CONSTRAINT "user_guardian_type_check"
  CHECK ("guardian_type" IN ('parent', 'guardian'));

-- Preserve the legacy defaults for existing families that had not completed
-- their first seed. Families that already have coupon rows are left untouched.
INSERT INTO "coupon_types" (
  "family_id", "title", "description", "coupon_kind", "draw_weight"
)
SELECT
  f."id",
  defaults."title",
  defaults."description",
  defaults."coupon_kind",
  defaults."draw_weight"
FROM "families" AS f
INNER JOIN "user" AS owner ON owner."id" = f."owner_user_id"
INNER JOIN "family_settings" AS settings ON settings."family_id" = f."id"
CROSS JOIN LATERAL (
  VALUES
    (owner."name" || '의 엉덩이 춤 관람권 🕺', owner."name" || '의 신나는 엉덩이 춤을 관람해요.', 'regular', 15),
    ('인간 놀이기구 탑승권 ✈️', owner."name" || CASE
      WHEN ascii(right(owner."name", 1)) BETWEEN 44032 AND 55203
        AND mod(ascii(right(owner."name", 1)) - 44032, 28) <> 0
      THEN '이'
      ELSE '가'
    END || ' 안전하게 태워주는 인간 놀이기구를 즐겨요.', 'regular', 20),
    ('침대까지 어부바 특급열차 🚂', owner."name" || ' 등에 업혀 침대까지 이동해요.', 'regular', 25),
    (owner."name" || '의 특급 안마 3분 💆‍♀️', owner."name" || '에게 3분 동안 안마를 받아요.', 'regular', 20),
    ('꽝 쿠폰: ' || owner."name" || ' 볼에 뽀뽀 3번 하기 😘', '꽝 쿠폰 미션: ' || owner."name" || ' 볼에 뽀뽀 3번 하기', 'blank', 1),
    ('꽝 쿠폰: ' || owner."name" || '에게 하트 날리며 사랑해요 외치기 🫶', '꽝 쿠폰 미션: ' || owner."name" || '에게 사랑한다고 표현하기', 'blank', 1),
    ('꽝 쿠폰: ' || owner."name" || ' 어깨 1분 주물러주기 💆‍♂️', '꽝 쿠폰 미션: ' || owner."name" || ' 어깨 1분 주물러주기', 'blank', 1)
) AS defaults("title", "description", "coupon_kind", "draw_weight")
WHERE settings."coupon_defaults_seeded" = false
  AND NOT EXISTS (
    SELECT 1
    FROM "coupon_types" AS existing
    WHERE existing."family_id" = f."id"
  );

-- Existing coupon rows are never updated or deleted. Mark the legacy seed as
-- complete only after restoring defaults for any pre-existing unseeded family.
UPDATE "family_settings"
SET "coupon_defaults_seeded" = true,
    "updated_at" = now()
WHERE "coupon_defaults_seeded" = false;
