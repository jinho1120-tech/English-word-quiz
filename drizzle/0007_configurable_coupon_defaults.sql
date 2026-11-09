ALTER TABLE "family_settings"
  ADD COLUMN "blank_coupon_probability" integer DEFAULT 20 NOT NULL,
  ADD COLUMN "coupon_defaults_seeded" boolean DEFAULT false NOT NULL;

ALTER TABLE "coupon_types"
  ADD COLUMN "coupon_kind" varchar(16) DEFAULT 'regular' NOT NULL,
  ADD COLUMN "draw_weight" integer DEFAULT 1 NOT NULL;

ALTER TABLE "family_settings"
  ADD CONSTRAINT "family_settings_blank_coupon_probability_check"
  CHECK ("blank_coupon_probability" >= 0 AND "blank_coupon_probability" <= 100);

ALTER TABLE "coupon_types"
  ADD CONSTRAINT "coupon_types_coupon_kind_check"
  CHECK ("coupon_kind" IN ('regular', 'blank'));

ALTER TABLE "coupon_types"
  ADD CONSTRAINT "coupon_types_draw_weight_check"
  CHECK ("draw_weight" >= 1 AND "draw_weight" <= 1000);
