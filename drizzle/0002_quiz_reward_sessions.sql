ALTER TABLE "child_quiz_attempts" ADD COLUMN "quiz_session_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "child_quiz_attempts" ADD COLUMN "hint_used" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "child_quiz_attempts_session_idx" ON "child_quiz_attempts" USING btree ("child_profile_id","quiz_session_id");
