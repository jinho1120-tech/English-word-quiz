// Drizzle schema for app-owned family, child, word, rate-limit, and learning-history tables.
// Better Auth core tables are created separately by the built-in Kysely adapter migration.
import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/**
 * One family belongs to one authenticated parent account.
 * Parent authentication remains Better Auth; children are managed profiles.
 */
export const families = pgTable("families", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerUnique: uniqueIndex("families_owner_user_unique").on(table.ownerUserId),
}))


/**
 * Additional authenticated parents who share management of a family.
 * The original family owner remains the representative parent.
 */
export const familyMembers = pgTable("family_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: varchar("role", { length: 20 }).default("admin").notNull(),
  invitedByUserId: text("invited_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  familyUserUnique: uniqueIndex("family_members_family_user_unique").on(table.familyId, table.userId),
  userIdx: index("family_members_user_idx").on(table.userId),
}))

/**
 * Invitations are delivered as shareable links. Only a hash of the random
 * token is stored; acceptance requires a signed-in account with matching email.
 */
export const familyInvitations = pgTable("family_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedByUserId: text("invited_by_user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("family_invitations_token_hash_unique").on(table.tokenHash),
  familyEmailIdx: index("family_invitations_family_email_idx").on(table.familyId, table.email),
}))

export const childProfiles = pgTable("child_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 40 }).notNull(),
  // Store only salted password hashes and hashes of access codes; never store PINs/codes in plaintext.
  pinHash: text("pin_hash").notNull(),
  accessCodeHash: text("access_code_hash").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  familyNameUnique: uniqueIndex("child_profiles_family_name_unique").on(table.familyId, table.displayName),
  accessCodeHashUnique: uniqueIndex("child_profiles_access_code_hash_unique").on(table.accessCodeHash),
  familyIdx: index("child_profiles_family_idx").on(table.familyId),
}))

/**
 * QR enrollment tokens are one-time bearer credentials with a short expiry.
 * The raw token is shown only once; only its SHA-256 hash is stored.
 */
export const childDeviceEnrollments = pgTable("child_device_enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  childProfileId: uuid("child_profile_id").notNull().references(() => childProfiles.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("child_device_enrollments_token_hash_unique").on(table.tokenHash),
  childIdx: index("child_device_enrollments_child_idx").on(table.childProfileId),
}))

/**
 * A child session is device-specific and independently revocable by the parent.
 * Only a hash of the opaque session token is stored.
 */
export const childDeviceSessions = pgTable("child_device_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  childProfileId: uuid("child_profile_id").notNull().references(() => childProfiles.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  deviceLabel: varchar("device_label", { length: 100 }),
  // No fixed expiry: the parent or the device explicitly revokes this session.
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("child_device_sessions_token_hash_unique").on(table.tokenHash),
  childIdx: index("child_device_sessions_child_idx").on(table.childProfileId),
}))

export const familySettings = pgTable("family_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  couponsEnabled: boolean("coupons_enabled").default(false).notNull(),
  rewardMinScore: integer("reward_min_score").default(100).notNull(),
  rewardMinQuestions: integer("reward_min_questions").default(10).notNull(),
  requireNoHint: boolean("require_no_hint").default(true).notNull(),
  blankCouponProbability: integer("blank_coupon_probability").default(20).notNull(),
  couponDefaultsSeeded: boolean("coupon_defaults_seeded").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  familyUnique: uniqueIndex("family_settings_family_unique").on(table.familyId),
}))

export const couponTypes = pgTable("coupon_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 80 }).notNull(),
  description: text("description"),
  couponKind: varchar("coupon_kind", { length: 16 }).default("regular").notNull(),
  drawWeight: integer("draw_weight").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  familyIdx: index("coupon_types_family_idx").on(table.familyId),
}))

export const couponRewards = pgTable("coupon_rewards", {
  id: uuid("id").defaultRandom().primaryKey(),
  childProfileId: uuid("child_profile_id").notNull().references(() => childProfiles.id, { onDelete: "cascade" }),
  couponTypeId: uuid("coupon_type_id").references(() => couponTypes.id, { onDelete: "set null" }),
  couponTitleSnapshot: varchar("coupon_title_snapshot", { length: 80 }).notNull(),
  status: varchar("status", { length: 24 }).default("earned").notNull(),
  // Unique source key makes reward creation idempotent for a quiz attempt.
  sourceKey: varchar("source_key", { length: 120 }).notNull(),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
  redeemedAt: timestamp("redeemed_at"),
}, (table) => ({
  sourceKeyUnique: uniqueIndex("coupon_rewards_source_key_unique").on(table.sourceKey),
  childStatusIdx: index("coupon_rewards_child_status_idx").on(table.childProfileId, table.status),
}))

/**
 * Subjects are configured independently for each child.
 * Archived subjects remain available for historical learning records.
 */
export const couponRedemptionTokens = pgTable("coupon_redemption_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  rewardId: uuid("reward_id").notNull().references(() => couponRewards.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("coupon_redemption_tokens_token_hash_unique").on(table.tokenHash),
  rewardIdx: index("coupon_redemption_tokens_reward_idx").on(table.rewardId),
}))


/** Parent-facing notifications and optional Web Push delivery. */
export const parentNotifications = pgTable("parent_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id").notNull(),
  childProfileId: uuid("child_profile_id").references(() => childProfiles.id, { onDelete: "set null" }),
  type: varchar("type", { length: 40 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  message: text("message").notNull(),
  href: varchar("href", { length: 300 }).default("/parent").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recipientCreatedIdx: index("parent_notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
  recipientReadIdx: index("parent_notifications_recipient_read_idx").on(table.recipientUserId, table.readAt),
  familyIdx: index("parent_notifications_family_idx").on(table.familyId),
}))

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
  userIdx: index("push_subscriptions_user_idx").on(table.userId),
}))

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  pushEnabled: boolean("push_enabled").default(true).notNull(),
  couponIssued: boolean("coupon_issued").default(true).notNull(),
  couponUseRequested: boolean("coupon_use_requested").default(true).notNull(),
  penaltyIssued: boolean("penalty_issued").default(true).notNull(),
  penaltyCompleted: boolean("penalty_completed").default(true).notNull(),
  deviceRegistered: boolean("device_registered").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  familyUserUnique: uniqueIndex("notification_preferences_family_user_unique").on(table.familyId, table.userId),
}))

export const childSubjects = pgTable("child_subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  childProfileId: uuid("child_profile_id").notNull().references(() => childProfiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 60 }).notNull(),
  calendarColor: varchar("calendar_color", { length: 7 }).default("#2563EB").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  childNameUnique: uniqueIndex("child_subjects_child_name_unique").on(table.childProfileId, table.name),
  childSortIdx: index("child_subjects_child_sort_idx").on(table.childProfileId, table.sortOrder),
}))

export const wordEntries = pgTable("word_entries", {
  id: serial("id").primaryKey(),
  // Kept as an ownership boundary; this must match the parent who owns childProfileId.
  userId: text("user_id").notNull(),
  // Nullable only for transitional legacy rows. New family-owned words must set this.
  childProfileId: uuid("child_profile_id").references(() => childProfiles.id, { onDelete: "cascade" }),
  // Legacy display fields are retained during migration from the original fixed-profile app.
  profile: varchar("profile", { length: 40 }).notNull(),
  assignmentDate: varchar("assignment_date", { length: 20 }).notNull(),
  // Subject ID is authoritative for new data; text remains for legacy compatibility.
  subjectId: uuid("subject_id").references(() => childSubjects.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 60 }).default("단어").notNull(),
  word: varchar("word", { length: 100 }).notNull(),
  meaning: varchar("meaning", { length: 200 }).notNull(),
  example: text("example"),
  wrongCount: integer("wrong_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: index("word_entries_user_date_idx").on(table.userId, table.assignmentDate),
  userWrongIdx: index("word_entries_user_wrong_idx").on(table.userId, table.wrongCount),
  childDateIdx: index("word_entries_child_date_idx").on(table.childProfileId, table.assignmentDate),
  childWrongIdx: index("word_entries_child_wrong_idx").on(table.childProfileId, table.wrongCount),
  subjectIdx: index("word_entries_subject_idx").on(table.subjectId, table.assignmentDate),
}))

/** Durable audit trail for privileged support changes; intentionally not FK-cascaded with families. */
export const superAdminAuditLogs = pgTable("super_admin_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: varchar("actor_email", { length: 320 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  targetFamilyId: uuid("target_family_id").notNull(),
  targetRecordId: text("target_record_id"),
  details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  familyCreatedIdx: index("super_admin_audit_family_created_idx").on(table.targetFamilyId, table.createdAt),
}))

export type WordEntry = typeof wordEntries.$inferSelect
export type NewWordEntry = typeof wordEntries.$inferInsert

export const rateLimits = pgTable("rate_limits", {
  userId: text("user_id").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  windowStartedAt: timestamp("window_started_at").defaultNow().notNull(),
  requestCount: integer("request_count").default(0).notNull(),
}, (table) => ({
  userActionUnique: uniqueIndex("rate_limits_user_action_unique").on(table.userId, table.action),
}))

/**
 * Immutable per-question history for child learning statistics.
 * Word and subject snapshots keep reports meaningful if a word is later edited.
 */
export const childQuizAttempts = pgTable("child_quiz_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  childProfileId: uuid("child_profile_id").notNull().references(() => childProfiles.id, { onDelete: "cascade" }),
  wordEntryId: integer("word_entry_id").references(() => wordEntries.id, { onDelete: "set null" }),
  subjectId: uuid("subject_id").references(() => childSubjects.id, { onDelete: "set null" }),
  subjectName: varchar("subject_name", { length: 60 }).notNull(),
  wordSnapshot: varchar("word_snapshot", { length: 100 }).notNull(),
  assignmentDate: varchar("assignment_date", { length: 10 }).notNull(),
  quizSessionId: varchar("quiz_session_id", { length: 36 }),
  hintUsed: boolean("hint_used").default(false).notNull(),
  quizType: varchar("quiz_type", { length: 20 }).notNull(),
  isCorrect: boolean("is_correct").notNull(),
  answeredAt: timestamp("answered_at").defaultNow().notNull(),
}, (table) => ({
  childDateIdx: index("child_quiz_attempts_child_date_idx").on(table.childProfileId, table.assignmentDate),
  childSubjectIdx: index("child_quiz_attempts_child_subject_idx").on(table.childProfileId, table.subjectId, table.assignmentDate),
  quizSessionIdx: index("child_quiz_attempts_session_idx").on(table.childProfileId, table.quizSessionId),
}))

export { user, session, account, verification } from "./auth-schema"
