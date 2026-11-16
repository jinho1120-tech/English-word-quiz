ALTER TABLE "vocabulary_candidates"
  ADD COLUMN "reviewed_by_user_id" text;

CREATE TABLE "dictionary_lookup_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "normalized_expression" varchar(120) NOT NULL,
  "lookup_status" varchar(16) NOT NULL,
  "response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_url" text,
  "license_name" varchar(40) DEFAULT 'CC BY-SA 4.0' NOT NULL,
  "license_url" text,
  "checked_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "dictionary_lookup_cache_expression_unique"
  ON "dictionary_lookup_cache" ("normalized_expression");
CREATE INDEX "dictionary_lookup_cache_expires_idx"
  ON "dictionary_lookup_cache" ("expires_at");

ALTER TABLE "child_subjects"
  ADD COLUMN "is_ai_vocabulary" boolean DEFAULT false NOT NULL;

CREATE TABLE "vocabulary_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expression" varchar(120) NOT NULL,
  "normalized_expression" varchar(120) NOT NULL,
  "lexical_type" varchar(24) NOT NULL,
  "part_of_speech" varchar(40) DEFAULT 'phrase' NOT NULL,
  "sense_key" varchar(120) NOT NULL,
  "definition_en" text NOT NULL,
  "meaning_ko" varchar(200),
  "example_sentence" text,
  "cefr_level" varchar(4),
  "child_level" varchar(2),
  "domain" varchar(40),
  "register" varchar(24),
  "frequency_rank" integer,
  "difficulty_verified" boolean DEFAULT false NOT NULL,
  "verification_status" varchar(20) DEFAULT 'pending' NOT NULL,
  "source_name" varchar(60) DEFAULT 'FreeDictionaryAPI.com' NOT NULL,
  "source_entry_url" text,
  "license_name" varchar(40) DEFAULT 'CC BY-SA 4.0' NOT NULL,
  "license_url" text,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dictionary_fetched_at" timestamp,
  "verified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "vocabulary_candidates_sense_unique"
  ON "vocabulary_candidates" ("normalized_expression", "lexical_type", "part_of_speech", "sense_key");
CREATE INDEX "vocabulary_candidates_type_status_idx"
  ON "vocabulary_candidates" ("lexical_type", "verification_status");
CREATE INDEX "vocabulary_candidates_child_level_idx"
  ON "vocabulary_candidates" ("child_level", "lexical_type");
CREATE INDEX "vocabulary_candidates_cefr_level_idx"
  ON "vocabulary_candidates" ("cefr_level", "lexical_type");

ALTER TABLE "word_entries"
  ADD COLUMN "lexical_type" varchar(24) DEFAULT 'word' NOT NULL,
  ADD COLUMN "disambiguation" varchar(100),
  ADD COLUMN "vocabulary_candidate_id" uuid;

ALTER TABLE "word_entries"
  ADD CONSTRAINT "word_entries_vocabulary_candidate_id_vocabulary_candidates_id_fk"
  FOREIGN KEY ("vocabulary_candidate_id") REFERENCES "vocabulary_candidates"("id") ON DELETE SET NULL;
CREATE INDEX "word_entries_vocabulary_candidate_idx" ON "word_entries" ("vocabulary_candidate_id");

CREATE TABLE "ai_vocabulary_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "enabled" boolean DEFAULT false NOT NULL,
  "words_per_day" integer DEFAULT 5 NOT NULL,
  "idioms_per_day" integer DEFAULT 5 NOT NULL,
  "word_level" varchar(2) DEFAULT 'L1' NOT NULL,
  "idiom_level" varchar(2) DEFAULT 'L1' NOT NULL,
  "active_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
  "publish_mode" varchar(16) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "ai_vocabulary_settings_child_unique"
  ON "ai_vocabulary_settings" ("child_profile_id");

CREATE TABLE "ai_vocabulary_bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "study_date" varchar(10) NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "published_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "ai_vocabulary_bundles_child_date_unique"
  ON "ai_vocabulary_bundles" ("child_profile_id", "study_date");
CREATE INDEX "ai_vocabulary_bundles_child_status_idx"
  ON "ai_vocabulary_bundles" ("child_profile_id", "status");

CREATE TABLE "ai_vocabulary_bundle_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bundle_id" uuid NOT NULL REFERENCES "ai_vocabulary_bundles"("id") ON DELETE CASCADE,
  "candidate_id" uuid REFERENCES "vocabulary_candidates"("id") ON DELETE SET NULL,
  "word_entry_id" integer REFERENCES "word_entries"("id") ON DELETE SET NULL,
  "source_word_entry_id" integer REFERENCES "word_entries"("id") ON DELETE SET NULL,
  "source_type" varchar(20) NOT NULL,
  "lexical_type" varchar(24) NOT NULL,
  "expression_snapshot" varchar(100) NOT NULL,
  "meaning_snapshot" varchar(200) NOT NULL,
  "example_snapshot" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "front_viewed_at" timestamp,
  "back_viewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "ai_vocabulary_bundle_items_order_unique"
  ON "ai_vocabulary_bundle_items" ("bundle_id", "sort_order");
CREATE UNIQUE INDEX "ai_vocabulary_bundle_items_word_unique"
  ON "ai_vocabulary_bundle_items" ("bundle_id", "word_entry_id");
CREATE INDEX "ai_vocabulary_bundle_items_candidate_idx"
  ON "ai_vocabulary_bundle_items" ("candidate_id");

CREATE TABLE "child_word_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "word_entry_id" integer NOT NULL REFERENCES "word_entries"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "child_word_favorites_child_word_unique"
  ON "child_word_favorites" ("child_profile_id", "word_entry_id");
CREATE INDEX "child_word_favorites_child_created_idx"
  ON "child_word_favorites" ("child_profile_id", "created_at");

CREATE TABLE "ai_vocabulary_level_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "lexical_type" varchar(24) NOT NULL,
  "starting_level" varchar(2) NOT NULL,
  "assigned_level" varchar(2) NOT NULL,
  "question_count" integer NOT NULL,
  "correct_count" integer NOT NULL,
  "confidence" varchar(16) NOT NULL,
  "assessment_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "completed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "ai_vocabulary_assessments_child_type_completed_idx"
  ON "ai_vocabulary_level_assessments" ("child_profile_id", "lexical_type", "completed_at");

CREATE TABLE "child_word_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_profile_id" uuid NOT NULL REFERENCES "child_profiles"("id") ON DELETE CASCADE,
  "expression" varchar(120) NOT NULL,
  "normalized_expression" varchar(120) NOT NULL,
  "lexical_type" varchar(24) DEFAULT 'word' NOT NULL,
  "meaning" varchar(200) NOT NULL,
  "example" text,
  "validation_status" varchar(20) DEFAULT 'pending' NOT NULL,
  "dictionary_checked_at" timestamp,
  "reviewed_by_user_id" text,
  "reviewed_at" timestamp,
  "created_word_entry_id" integer REFERENCES "word_entries"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "child_word_submissions_child_status_created_idx"
  ON "child_word_submissions" ("child_profile_id", "validation_status", "created_at");
