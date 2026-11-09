CREATE TABLE IF NOT EXISTS "coupon_redemption_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reward_id" uuid NOT NULL REFERENCES "coupon_rewards"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemption_tokens_token_hash_unique" ON "coupon_redemption_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "coupon_redemption_tokens_reward_idx" ON "coupon_redemption_tokens" ("reward_id");
