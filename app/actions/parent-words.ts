"use server"

import { and, asc, desc, eq, gte, lte } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { childProfiles, childQuizAttempts, childSubjects, families, familyMembers, wordEntries } from "@/lib/db/schema"
import { consumeUserRateLimit } from "@/lib/rate-limit"
import { extractWordsFromImage } from "@/lib/ai-word-scan"

async function requireParentChild(childProfileId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("부모 계정 로그인이 필요합니다.")
  let family = await db.select({ id: families.id, ownerUserId: families.ownerUserId })
    .from(families).where(eq(families.ownerUserId, session.user.id)).limit(1)
  let familyRow = family[0]
  if (!familyRow) {
    const [membership] = await db.select({ familyId: familyMembers.familyId })
      .from(familyMembers).where(eq(familyMembers.userId, session.user.id)).limit(1)
    if (membership) {
      const [joined] = await db.select({ id: families.id, ownerUserId: families.ownerUserId })
        .from(families).where(eq(families.id, membership.familyId)).limit(1)
      familyRow = joined
    }
  }
  if (!familyRow) throw new Error("가족 정보를 찾을 수 없습니다.")
  const [child] = await db.select({
    id: childProfiles.id,
    name: childProfiles.displayName,
    ownerUserId: families.ownerUserId,
  }).from(childProfiles)
    .innerJoin(families, eq(childProfiles.familyId, families.id))
    .where(and(eq(childProfiles.id, childProfileId), eq(families.id, familyRow.id), eq(childProfiles.isActive, true)))
    .limit(1)
  if (!child) throw new Error("해당 자녀의 데이터를 관리할 권한이 없습니다.")
  return child
}

async function ownedSubject(childProfileId: string, subjectId: string) {
  const [subject] = await db.select().from(childSubjects)
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, childProfileId), eq(childSubjects.isArchived, false)))
    .limit(1)
  if (!subject) throw new Error("선택한 과목을 찾을 수 없습니다.")
  return subject
}

export async function getParentChildWords(childProfileId: string, date: string) {
  const child = await requireParentChild(childProfileId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜 형식이 올바르지 않습니다.")
  const [subjects, words, attempts] = await Promise.all([
    db.select().from(childSubjects).where(and(eq(childSubjects.childProfileId, child.id), eq(childSubjects.isArchived, false))).orderBy(asc(childSubjects.sortOrder)),
    db.select().from(wordEntries).where(and(eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.id), eq(wordEntries.assignmentDate, date))).orderBy(asc(wordEntries.createdAt)),
    db.select({ subjectName: childQuizAttempts.subjectName, isCorrect: childQuizAttempts.isCorrect }).from(childQuizAttempts)
      .where(and(eq(childQuizAttempts.childProfileId, child.id), gte(childQuizAttempts.answeredAt, new Date(Date.now() - 30 * 86400000)))),
  ])
  const correct = attempts.filter((item) => item.isCorrect).length
  const subjectStats = new Map<string, { total: number; correct: number }>()
  for (const item of attempts) {
    const current = subjectStats.get(item.subjectName) ?? { total: 0, correct: 0 }
    current.total += 1
    if (item.isCorrect) current.correct += 1
    subjectStats.set(item.subjectName, current)
  }
  const stats = { total: attempts.length, correct, accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : 0,
    subjects: Array.from(subjectStats.entries()).map(([name, value]) => ({ name, ...value, accuracy: Math.round(value.correct / value.total * 100) })) }
  return { childName: child.name, subjects, words, stats }
}

const PARENT_CALENDAR_COLORS = new Set(["#2563EB", "#16A34A", "#F59E0B", "#EF4444", "#A855F7", "#EC4899", "#0D9488", "#64748B"])

export async function getParentChildCalendarData(childProfileId: string, month: string) {
  const child = await requireParentChild(childProfileId)
  if (typeof month !== "string" || !/^\\d{4}-\\d{2}$/.test(month)) throw new Error("달력 월 형식이 올바르지 않습니다.")
  const start = `${month}-01`
  const end = `${month}-31`
  const rows = await db.select({
    date: wordEntries.assignmentDate,
    subjectId: wordEntries.subjectId,
    subject: wordEntries.subject,
  }).from(wordEntries).where(and(
    eq(wordEntries.userId, child.ownerUserId),
    eq(wordEntries.childProfileId, child.id),
    gte(wordEntries.assignmentDate, start),
    lte(wordEntries.assignmentDate, end),
  ))
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.date}:${row.subjectId ?? row.subject}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function updateParentChildSubjectColor(childProfileId: string, subjectId: string, color: string) {
  const child = await requireParentChild(childProfileId)
  if (typeof subjectId !== "string" || !subjectId || !PARENT_CALENDAR_COLORS.has(color)) throw new Error("과목 색상 정보가 올바르지 않습니다.")
  const [updated] = await db.update(childSubjects).set({ calendarColor: color, updatedAt: new Date() })
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, child.id), eq(childSubjects.isArchived, false)))
    .returning({ id: childSubjects.id })
  if (!updated) throw new Error("과목을 찾을 수 없습니다.")
  revalidatePath("/parent")
}

export async function addParentChildWord(childProfileId: string, input: { date: string; subjectId: string; word: string; meaning: string; example?: string }) {
  const child = await requireParentChild(childProfileId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("날짜 형식이 올바르지 않습니다.")
  const word = input.word?.trim()
  const meaning = input.meaning?.trim()
  const example = input.example?.trim() || null
  if (!word || word.length > 100 || !meaning || meaning.length > 200 || (example && example.length > 2000)) throw new Error("단어, 뜻 또는 예문 길이를 확인해 주세요.")
  const subject = await ownedSubject(child.id, input.subjectId)
  await db.insert(wordEntries).values({ userId: child.ownerUserId, childProfileId: child.id, profile: child.name, assignmentDate: input.date, subjectId: subject.id, subject: subject.name, word, meaning, example })
  revalidatePath("/parent")
}

export async function updateParentChildWord(childProfileId: string, id: number, input: { subjectId: string; word: string; meaning: string; example?: string }) {
  const child = await requireParentChild(childProfileId)
  const word = input.word?.trim()
  const meaning = input.meaning?.trim()
  const example = input.example?.trim() || null
  if (!Number.isInteger(id) || !word || word.length > 100 || !meaning || meaning.length > 200 || (example && example.length > 2000)) throw new Error("단어, 뜻 또는 예문을 확인해 주세요.")
  const subject = await ownedSubject(child.id, input.subjectId)
  const [updated] = await db.update(wordEntries).set({ subjectId: subject.id, subject: subject.name, word, meaning, example })
    .where(and(eq(wordEntries.id, id), eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.id)))
    .returning({ id: wordEntries.id })
  if (!updated) throw new Error("단어를 찾을 수 없습니다.")
  revalidatePath("/parent")
}

export async function deleteParentChildWord(childProfileId: string, id: number) {
  const child = await requireParentChild(childProfileId)
  await db.delete(wordEntries).where(and(eq(wordEntries.id, id), eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.id)))
  revalidatePath("/parent")
}

export async function scanParentChildWordsImage(childProfileId: string, base64Image: string, mimeType: string) {
  const child = await requireParentChild(childProfileId)
  const allowed = await consumeUserRateLimit(child.ownerUserId, "ai-word-image-scan", 10, 3600)
  if (!allowed) throw new Error("AI 단어 추출은 1시간에 10회까지 가능합니다.")
  return extractWordsFromImage(base64Image, mimeType)
}

export async function addParentChildWordsBulk(childProfileId: string, input: { date: string; subjectId: string; words: { word: string; meaning: string; example?: string }[] }) {
  const child = await requireParentChild(childProfileId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Array.isArray(input.words) || input.words.length < 1 || input.words.length > 100) throw new Error("날짜 또는 단어 목록을 확인해 주세요. 한 번에 1~100개까지 등록할 수 있습니다.")
  const subject = await ownedSubject(child.id, input.subjectId)
  const rows = input.words.map((item) => {
    if (!item || typeof item.word !== "string" || typeof item.meaning !== "string" || (item.example != null && typeof item.example !== "string")) throw new Error("단어 데이터가 올바르지 않습니다.")
    const word = item.word.trim(), meaning = item.meaning.trim(), example = item.example?.trim() || null
    if (!word || word.length > 100 || !meaning || meaning.length > 200 || (example && example.length > 2000)) throw new Error("단어, 뜻 또는 예문 길이를 확인해 주세요.")
    return { userId: child.ownerUserId, childProfileId: child.id, profile: child.name, assignmentDate: input.date, subjectId: subject.id, subject: subject.name, word, meaning, example }
  })
  await db.insert(wordEntries).values(rows)
  revalidatePath("/parent")
  return { count: rows.length }
}
