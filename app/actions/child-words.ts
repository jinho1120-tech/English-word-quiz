"use server"

import { and, asc, desc, eq, gt, gte } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { childQuizAttempts, childSubjects, wordEntries } from "@/lib/db/schema"
import { consumeUserRateLimit } from "@/lib/rate-limit"
import { extractWordsFromImage } from "@/lib/ai-word-scan"
import { getChildDeviceSession } from "@/lib/child-auth"

async function requireChild() {
  const session = await getChildDeviceSession()
  if (!session) throw new Error("자녀 기기 로그인이 필요합니다.")
  return session
}

function validateDate(date: string) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜 형식이 올바르지 않습니다.")
}

async function requireOwnedSubject(childProfileId: string, subjectId: string) {
  const [subject] = await db.select().from(childSubjects)
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, childProfileId), eq(childSubjects.isArchived, false)))
    .limit(1)
  if (!subject) throw new Error("선택한 과목을 찾을 수 없습니다.")
  return subject
}

export async function createChildSubject(nameInput: string) {
  const child = await requireChild()
  if (typeof nameInput !== "string") throw new Error("과목 이름을 입력해 주세요.")
  const name = nameInput.trim()
  if (!name || name.length > 60) throw new Error("과목 이름은 1~60자여야 합니다.")
  const [existing] = await db.select({ id: childSubjects.id }).from(childSubjects)
    .where(and(eq(childSubjects.childProfileId, child.childProfileId), eq(childSubjects.name, name))).limit(1)
  if (existing) throw new Error("이미 등록된 과목 이름입니다.")
  const current = await db.select({ sortOrder: childSubjects.sortOrder }).from(childSubjects)
    .where(eq(childSubjects.childProfileId, child.childProfileId))
  const sortOrder = current.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
  const [created] = await db.insert(childSubjects).values({ childProfileId: child.childProfileId, name, sortOrder }).returning()
  revalidatePath("/child")
  return created
}

export async function renameChildSubject(subjectId: string, nameInput: string) {
  const child = await requireChild()
  if (typeof subjectId !== "string" || typeof nameInput !== "string") throw new Error("과목 정보가 올바르지 않습니다.")
  const name = nameInput.trim()
  if (!name || name.length > 60) throw new Error("과목 이름은 1~60자여야 합니다.")
  const [updated] = await db.update(childSubjects).set({ name, updatedAt: new Date() })
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, child.childProfileId), eq(childSubjects.isArchived, false)))
    .returning({ id: childSubjects.id })
  if (!updated) throw new Error("과목을 찾을 수 없습니다.")
  await db.update(wordEntries).set({ subject: name }).where(and(eq(wordEntries.subjectId, subjectId), eq(wordEntries.childProfileId, child.childProfileId)))
  revalidatePath("/child")
}

export async function archiveChildSubject(subjectId: string) {
  const child = await requireChild()
  if (typeof subjectId !== "string" || !subjectId) throw new Error("과목 정보가 올바르지 않습니다.")
  const [updated] = await db.update(childSubjects).set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, child.childProfileId), eq(childSubjects.isArchived, false)))
    .returning({ id: childSubjects.id })
  if (!updated) throw new Error("과목을 찾을 수 없습니다.")
  revalidatePath("/child")
}

export async function getChildLearningData(date: string) {
  const child = await requireChild()
  validateDate(date)
  const subjects = await db.select().from(childSubjects)
    .where(and(eq(childSubjects.childProfileId, child.childProfileId), eq(childSubjects.isArchived, false)))
    .orderBy(asc(childSubjects.sortOrder), asc(childSubjects.createdAt))
  const words = await db.select().from(wordEntries)
    .where(and(
      eq(wordEntries.userId, child.ownerUserId),
      eq(wordEntries.childProfileId, child.childProfileId),
      eq(wordEntries.assignmentDate, date),
    ))
    .orderBy(asc(wordEntries.createdAt))
  const wrongWords = await db.select().from(wordEntries)
    .where(and(
      eq(wordEntries.userId, child.ownerUserId),
      eq(wordEntries.childProfileId, child.childProfileId),
      gt(wordEntries.wrongCount, 0),
    ))
    .orderBy(desc(wordEntries.wrongCount), asc(wordEntries.createdAt))
  const since = new Date()
  since.setDate(since.getDate() - 29)
  const attempts = await db.select({
    subjectName: childQuizAttempts.subjectName,
    isCorrect: childQuizAttempts.isCorrect,
    answeredAt: childQuizAttempts.answeredAt,
  }).from(childQuizAttempts)
    .where(and(eq(childQuizAttempts.childProfileId, child.childProfileId), gte(childQuizAttempts.answeredAt, since)))
    .orderBy(desc(childQuizAttempts.answeredAt))
  const correctCount = attempts.filter((item) => item.isCorrect).length
  const subjectStats = new Map<string, { total: number; correct: number }>()
  for (const item of attempts) {
    const current = subjectStats.get(item.subjectName) ?? { total: 0, correct: 0 }
    current.total += 1
    if (item.isCorrect) current.correct += 1
    subjectStats.set(item.subjectName, current)
  }
  const stats = {
    total: attempts.length,
    correct: correctCount,
    accuracy: attempts.length ? Math.round(correctCount / attempts.length * 100) : 0,
    subjects: Array.from(subjectStats.entries()).map(([name, value]) => ({ name, ...value, accuracy: Math.round(value.correct / value.total * 100) })),
  }
  return { childName: child.childName, subjects, words, wrongWords, stats }
}

export async function addChildWord(input: {
  date: string
  subjectId: string
  word: string
  meaning: string
  example?: string
}) {
  const child = await requireChild()
  validateDate(input.date)
  if (typeof input.word !== "string" || typeof input.meaning !== "string" || (input.example != null && typeof input.example !== "string")) throw new Error("입력값이 올바르지 않습니다.")
  const word = input.word.trim()
  const meaning = input.meaning.trim()
  const example = input.example?.trim() || null
  if (!word || word.length > 100 || !meaning || meaning.length > 200 || (example && example.length > 2000)) throw new Error("단어, 뜻 또는 예문 길이를 확인해 주세요.")
  const subject = await requireOwnedSubject(child.childProfileId, input.subjectId)
  await db.insert(wordEntries).values({
    userId: child.ownerUserId,
    childProfileId: child.childProfileId,
    profile: child.childName,
    assignmentDate: input.date,
    subjectId: subject.id,
    subject: subject.name,
    word,
    meaning,
    example,
  })
  revalidatePath("/child")
}

export async function updateChildWord(id: number, input: {
  subjectId: string
  word: string
  meaning: string
  example?: string
}) {
  const child = await requireChild()
  if (!Number.isInteger(id) || id < 1) throw new Error("단어 정보가 올바르지 않습니다.")
  if (typeof input.word !== "string" || typeof input.meaning !== "string" || (input.example != null && typeof input.example !== "string")) throw new Error("입력값이 올바르지 않습니다.")
  const word = input.word.trim()
  const meaning = input.meaning.trim()
  const example = input.example?.trim() || null
  if (!word || word.length > 100 || !meaning || meaning.length > 200 || (example && example.length > 2000)) throw new Error("단어, 뜻 또는 예문 길이를 확인해 주세요.")
  const subject = await requireOwnedSubject(child.childProfileId, input.subjectId)
  await db.update(wordEntries).set({
    subjectId: subject.id,
    subject: subject.name,
    word,
    meaning,
    example,
  }).where(and(
    eq(wordEntries.id, id),
    eq(wordEntries.userId, child.ownerUserId),
    eq(wordEntries.childProfileId, child.childProfileId),
  ))
  revalidatePath("/child")
}

export async function deleteChildWord(id: number) {
  const child = await requireChild()
  await db.delete(wordEntries).where(and(
    eq(wordEntries.id, id),
    eq(wordEntries.userId, child.ownerUserId),
    eq(wordEntries.childProfileId, child.childProfileId),
  ))
  revalidatePath("/child")
}

export async function recordChildQuizResult(id: number, isCorrect: boolean, quizType: "standard" | "listening" = "standard") {
  const child = await requireChild()
  if (!Number.isInteger(id) || typeof isCorrect !== "boolean" || !["standard", "listening"].includes(quizType)) throw new Error("채점 정보가 올바르지 않습니다.")
  const [word] = await db.select().from(wordEntries)
    .where(and(eq(wordEntries.id, id), eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.childProfileId)))
    .limit(1)
  if (!word) throw new Error("학습 단어를 찾을 수 없습니다.")
  await db.insert(childQuizAttempts).values({
    childProfileId: child.childProfileId,
    wordEntryId: word.id,
    subjectId: word.subjectId,
    subjectName: word.subject,
    wordSnapshot: word.word,
    assignmentDate: word.assignmentDate,
    quizType,
    isCorrect,
  })
  await db.update(wordEntries).set({
    wrongCount: isCorrect ? Math.max(0, word.wrongCount - 1) : word.wrongCount + 1,
  }).where(and(eq(wordEntries.id, id), eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.childProfileId)))
  revalidatePath("/child")
}

export async function scanChildWordsImage(base64Image: string, mimeType: string) {
  const child = await requireChild()
  const allowed = await consumeUserRateLimit(child.ownerUserId, "ai-word-image-scan", 10, 3600)
  if (!allowed) throw new Error("AI 단어 추출은 1시간에 10회까지 가능합니다.")
  return extractWordsFromImage(base64Image, mimeType)
}

export async function addChildWordsBulk(input: { date: string; subjectId: string; words: { word: string; meaning: string; example?: string }[] }) {
  const child = await requireChild()
  validateDate(input.date)
  if (!Array.isArray(input.words) || input.words.length < 1 || input.words.length > 100) throw new Error("한 번에 1~100개 단어를 등록할 수 있습니다.")
  const subject = await requireOwnedSubject(child.childProfileId, input.subjectId)
  const rows = input.words.map((item) => {
    if (!item || typeof item.word !== "string" || typeof item.meaning !== "string" || (item.example != null && typeof item.example !== "string")) throw new Error("단어 데이터가 올바르지 않습니다.")
    const word = item.word.trim(), meaning = item.meaning.trim(), example = item.example?.trim() || null
    if (!word || word.length > 100 || !meaning || meaning.length > 200 || (example && example.length > 2000)) throw new Error("단어, 뜻 또는 예문 길이를 확인해 주세요.")
    return { userId: child.ownerUserId, childProfileId: child.childProfileId, profile: child.childName, assignmentDate: input.date, subjectId: subject.id, subject: subject.name, word, meaning, example }
  })
  await db.insert(wordEntries).values(rows)
  revalidatePath("/child")
  return { count: rows.length }
}
