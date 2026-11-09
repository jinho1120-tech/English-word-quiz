CREATE TABLE "parent_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "recipient_user_id" text NOT NULL,
  "child_profile_id" uuid REFERENCES "child_profiles"("id") ON DELETE SET NULL,
  "type" varchar(40) NOT NULL,
  "title" varchar(120) NOT NULL,
  "message" text NOT NULL,
  "href" varchar(300) DEFAULT '/parent' NOT NULL,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "parent_notifications_recipient_created_idx" ON "parent_notifications" USING btree ("recipient_user_id","created_at");
--> statement-breakpoint
CREATE INDEX "parent_notifications_recipient_read_idx" ON "parent_notifications" USING btree ("recipient_user_id","read_at");
--> statement-breakpoint
CREATE INDEX "parent_notifications_family_idx" ON "parent_notifications" USING btree ("family_id");
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");
--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "push_enabled" boolean DEFAULT true NOT NULL,
  "coupon_issued" boolean DEFAULT true NOT NULL,
  "coupon_use_requested" boolean DEFAULT true NOT NULL,
  "penalty_issued" boolean DEFAULT true NOT NULL,
  "penalty_completed" boolean DEFAULT true NOT NULL,
  "device_registered" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_family_user_unique" ON "notification_preferences" USING btree ("family_id","user_id");
