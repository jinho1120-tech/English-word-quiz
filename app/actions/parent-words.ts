"use server"

import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { childProfiles, childSubjects, families, wordEntries } from "@/lib/db/schema"

async function requireParentChild(childProfileId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("부모 계정 로그인이 필요합니다.")
  const [child] = await db.select({
    id: childProfiles.id,
    name: childProfiles.displayName,
    ownerUserId: families.ownerUserId,
  }).from(childProfiles)
    .innerJoin(families, eq(childProfiles.familyId, families.id))
    .where(and(eq(childProfiles.id, childProfileId), eq(families.ownerUserId, session.user.id), eq(childProfiles.isActive, true)))
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
  const [subjects, words] = await Promise.all([
    db.select().from(childSubjects).where(and(eq(childSubjects.childProfileId, child.id), eq(childSubjects.isArchived, false))).orderBy(asc(childSubjects.sortOrder)),
    db.select().from(wordEntries).where(and(eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.id), eq(wordEntries.assignmentDate, date))).orderBy(asc(wordEntries.createdAt)),
  ])
  return { childName: child.name, subjects, words }
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
