import { pgTable, serial, varchar, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core"

export const wordEntries = pgTable("word_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  profile: varchar("profile", { length: 20 }).notNull(),
  assignmentDate: varchar("assignment_date", { length: 20 }).notNull(),
  subject: varchar("subject", { length: 20 }).default("단어").notNull(),
  word: varchar("word", { length: 100 }).notNull(),
  meaning: varchar("meaning", { length: 200 }).notNull(),
  example: text("example"),
  wrongCount: integer("wrong_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: index("word_entries_user_date_idx").on(table.userId, table.assignmentDate),
  userWrongIdx: index("word_entries_user_wrong_idx").on(table.userId, table.wrongCount),
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
