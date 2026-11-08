CREATE TABLE "child_device_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_label" varchar(100),
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"display_name" varchar(40) NOT NULL,
	"pin_hash" text NOT NULL,
	"access_code_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"word_entry_id" integer,
	"subject_id" uuid,
	"subject_name" varchar(60) NOT NULL,
	"word_snapshot" varchar(100) NOT NULL,
	"assignment_date" varchar(10) NOT NULL,
	"quiz_type" varchar(20) NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"coupon_type_id" uuid,
	"coupon_title_snapshot" varchar(80) NOT NULL,
	"status" varchar(24) DEFAULT 'earned' NOT NULL,
	"source_key" varchar(120) NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL,
	"notified_at" timestamp,
	"redeemed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coupon_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(20) DEFAULT 'admin' NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"coupons_enabled" boolean DEFAULT false NOT NULL,
	"parent_phone" varchar(30),
	"reward_min_score" integer DEFAULT 100 NOT NULL,
	"reward_min_questions" integer DEFAULT 10 NOT NULL,
	"require_no_hint" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"user_id" text NOT NULL,
	"action" varchar(80) NOT NULL,
	"window_started_at" timestamp DEFAULT now() NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"child_profile_id" uuid,
	"profile" varchar(40) NOT NULL,
	"assignment_date" varchar(20) NOT NULL,
	"subject_id" uuid,
	"subject" varchar(60) DEFAULT '단어' NOT NULL,
	"word" varchar(100) NOT NULL,
	"meaning" varchar(200) NOT NULL,
	"example" text,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_device_enrollments" ADD CONSTRAINT "child_device_enrollments_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_device_sessions" ADD CONSTRAINT "child_device_sessions_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_quiz_attempts" ADD CONSTRAINT "child_quiz_attempts_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_quiz_attempts" ADD CONSTRAINT "child_quiz_attempts_word_entry_id_word_entries_id_fk" FOREIGN KEY ("word_entry_id") REFERENCES "public"."word_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_quiz_attempts" ADD CONSTRAINT "child_quiz_attempts_subject_id_child_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."child_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_subjects" ADD CONSTRAINT "child_subjects_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_rewards" ADD CONSTRAINT "coupon_rewards_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_rewards" ADD CONSTRAINT "coupon_rewards_coupon_type_id_coupon_types_id_fk" FOREIGN KEY ("coupon_type_id") REFERENCES "public"."coupon_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_types" ADD CONSTRAINT "coupon_types_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_settings" ADD CONSTRAINT "family_settings_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_entries" ADD CONSTRAINT "word_entries_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_entries" ADD CONSTRAINT "word_entries_subject_id_child_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."child_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "child_device_enrollments_token_hash_unique" ON "child_device_enrollments" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "child_device_enrollments_child_idx" ON "child_device_enrollments" USING btree ("child_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_device_sessions_token_hash_unique" ON "child_device_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "child_device_sessions_child_idx" ON "child_device_sessions" USING btree ("child_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_profiles_family_name_unique" ON "child_profiles" USING btree ("family_id","display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "child_profiles_access_code_hash_unique" ON "child_profiles" USING btree ("access_code_hash");--> statement-breakpoint
CREATE INDEX "child_profiles_family_idx" ON "child_profiles" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "child_quiz_attempts_child_date_idx" ON "child_quiz_attempts" USING btree ("child_profile_id","assignment_date");--> statement-breakpoint
CREATE INDEX "child_quiz_attempts_child_subject_idx" ON "child_quiz_attempts" USING btree ("child_profile_id","subject_id","assignment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "child_subjects_child_name_unique" ON "child_subjects" USING btree ("child_profile_id","name");--> statement-breakpoint
CREATE INDEX "child_subjects_child_sort_idx" ON "child_subjects" USING btree ("child_profile_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_rewards_source_key_unique" ON "coupon_rewards" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "coupon_rewards_child_status_idx" ON "coupon_rewards" USING btree ("child_profile_id","status");--> statement-breakpoint
CREATE INDEX "coupon_types_family_idx" ON "coupon_types" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "families_owner_user_unique" ON "families" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_invitations_token_hash_unique" ON "family_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "family_invitations_family_email_idx" ON "family_invitations" USING btree ("family_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_family_user_unique" ON "family_members" USING btree ("family_id","user_id");--> statement-breakpoint
CREATE INDEX "family_members_user_idx" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_settings_family_unique" ON "family_settings" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_user_action_unique" ON "rate_limits" USING btree ("user_id","action");--> statement-breakpoint
CREATE INDEX "word_entries_user_date_idx" ON "word_entries" USING btree ("user_id","assignment_date");--> statement-breakpoint
CREATE INDEX "word_entries_user_wrong_idx" ON "word_entries" USING btree ("user_id","wrong_count");--> statement-breakpoint
CREATE INDEX "word_entries_child_date_idx" ON "word_entries" USING btree ("child_profile_id","assignment_date");--> statement-breakpoint
CREATE INDEX "word_entries_child_wrong_idx" ON "word_entries" USING btree ("child_profile_id","wrong_count");--> statement-breakpoint
CREATE INDEX "word_entries_subject_idx" ON "word_entries" USING btree ("subject_id","assignment_date");