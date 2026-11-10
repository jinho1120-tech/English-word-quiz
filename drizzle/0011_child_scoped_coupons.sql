ALTER TABLE "coupon_types" ADD COLUMN "child_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "coupon_types" ADD CONSTRAINT "coupon_types_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "coupon_types_child_idx" ON "coupon_types" USING btree ("child_profile_id");
--> statement-breakpoint
CREATE TABLE "child_coupon_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "coupons_enabled" boolean DEFAULT false NOT NULL,
  "reward_min_score" integer DEFAULT 100 NOT NULL,
  "reward_min_questions" integer DEFAULT 10 NOT NULL,
  "require_no_hint" boolean DEFAULT true NOT NULL,
  "blank_coupon_probability" integer DEFAULT 20 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "child_coupon_settings_child_unique" ON "child_coupon_settings" USING btree ("child_profile_id");
--> statement-breakpoint
INSERT INTO "child_coupon_settings" (
  "child_profile_id", "coupons_enabled", "reward_min_score", "reward_min_questions",
  "require_no_hint", "blank_coupon_probability"
)
SELECT cp."id", COALESCE(fs."coupons_enabled", false), COALESCE(fs."reward_min_score", 100),
       COALESCE(fs."reward_min_questions", 10), COALESCE(fs."require_no_hint", true),
       COALESCE(fs."blank_coupon_probability", 20)
FROM "child_profiles" cp
LEFT JOIN "family_settings" fs ON fs."family_id" = cp."family_id"
ON CONFLICT ("child_profile_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "coupon_types" (
  "family_id", "child_profile_id", "title", "description", "coupon_kind",
  "draw_weight", "is_active", "created_at", "updated_at"
)
SELECT cp."family_id", cp."id", ct."title", ct."description", ct."coupon_kind",
       ct."draw_weight", ct."is_active", ct."created_at", ct."updated_at"
FROM "child_profiles" cp
JOIN "coupon_types" ct ON ct."family_id" = cp."family_id" AND ct."child_profile_id" IS NULL;
