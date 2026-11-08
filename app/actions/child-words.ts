"use server"

import { and, asc, desc, eq, gt } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { childSubjects, wordEntries } from "@/lib/db/schema"
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
  return { childName: child.childName, subjects, words, wrongWords }
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

export async function recordChildQuizResult(id: number, isCorrect: boolean) {
  const child = await requireChild()
  if (!Number.isInteger(id) || typeof isCorrect !== "boolean") throw new Error("채점 정보가 올바르지 않습니다.")
  const [word] = await db.select({ wrongCount: wordEntries.wrongCount }).from(wordEntries)
    .where(and(
      eq(wordEntries.id, id),
      eq(wordEntries.userId, child.ownerUserId),
      eq(wordEntries.childProfileId, child.childProfileId),
    )).limit(1)
  if (!word) return
  await db.update(wordEntries).set({
    wrongCount: isCorrect ? Math.max(0, word.wrongCount - 1) : word.wrongCount + 1,
  }).where(and(
    eq(wordEntries.id, id),
    eq(wordEntries.userId, child.ownerUserId),
    eq(wordEntries.childProfileId, child.childProfileId),
  ))
  revalidatePath("/child")
}
