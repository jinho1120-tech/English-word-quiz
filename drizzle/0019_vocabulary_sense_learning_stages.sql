ALTER TABLE "vocabulary_candidates"
  ADD COLUMN "sense_order" integer DEFAULT 1 NOT NULL,
  ADD COLUMN "learning_stage" varchar(16) DEFAULT 'primary' NOT NULL;

CREATE INDEX "vocabulary_candidates_learning_stage_idx"
  ON "vocabulary_candidates" ("learning_stage", "verification_status", "child_level");

ALTER TABLE "ai_vocabulary_settings"
  ADD COLUMN "sense_stage" varchar(16) DEFAULT 'primary' NOT NULL;
