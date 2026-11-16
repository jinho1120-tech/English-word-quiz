"use server"

import { createHash } from "node:crypto"
import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { aiVocabularySettings, childProfiles, childSubjects, families, familyMembers, vocabularyCandidates } from "@/lib/db/schema"
import { normalizeDictionaryExpression } from "@/lib/free-dictionary-api"
import { lookupFreeDictionaryCached } from "@/lib/free-dictionary-cache"

const LEVELS = new Set(["L1", "L2", "L3", "L4", "L5", "L6"])
const DAY_VALUES = new Set([0, 1, 2, 3, 4, 5, 6])

async function requireParentFamily() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("부모 계정 로그인이 필요합니다.")

  let [family] = await db.select({ id: families.id, ownerUserId: families.ownerUserId })
    .from(families).where(eq(families.ownerUserId, session.user.id)).limit(1)

  if (!family) {
    const [membership] = await db.select({ familyId: familyMembers.familyId })
      .from(familyMembers).where(eq(familyMembers.userId, session.user.id)).limit(1)
    if (membership) {
      const [joined] = await db.select({ id: families.id, ownerUserId: families.ownerUserId })
        .from(families).where(eq(families.id, membership.familyId)).limit(1)
      family = joined
    }
  }
  if (!family) {
    const [created] = await db.insert(families).values({ ownerUserId: session.user.id }).onConflictDoNothing().returning({ id: families.id, ownerUserId: families.ownerUserId })
    family = created ?? (await db.select({ id: families.id, ownerUserId: families.ownerUserId })
      .from(families).where(eq(families.ownerUserId, session.user.id)).limit(1))[0]
  }
  if (!family) throw new Error("가족 정보를 찾을 수 없습니다.")
  return { family, userId: session.user.id }
}

async function requireOwnedChild(childProfileId: string) {
  const { family } = await requireParentFamily()
  if (typeof childProfileId !== "string" || !childProfileId) throw new Error("자녀 정보가 올바르지 않습니다.")
  const [child] = await db.select({ id: childProfiles.id, displayName: childProfiles.displayName })
    .from(childProfiles)
    .where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, family.id)))
    .limit(1)
  if (!child) throw new Error("해당 자녀의 설정을 변경할 권한이 없습니다.")
  return child
}

export async function getParentAiVocabularySettings() {
  const { family } = await requireParentFamily()
  const rows = await db.select({
    childProfileId: childProfiles.id,
    childName: childProfiles.displayName,
    enabled: aiVocabularySettings.enabled,
    wordsPerDay: aiVocabularySettings.wordsPerDay,
    idiomsPerDay: aiVocabularySettings.idiomsPerDay,
    wordLevel: aiVocabularySettings.wordLevel,
    idiomLevel: aiVocabularySettings.idiomLevel,
    activeDays: aiVocabularySettings.activeDays,
    publishMode: aiVocabularySettings.publishMode,
  }).from(childProfiles)
    .leftJoin(aiVocabularySettings, eq(aiVocabularySettings.childProfileId, childProfiles.id))
    .where(eq(childProfiles.familyId, family.id))
    .orderBy(asc(childProfiles.createdAt))

  return rows.map((row) => ({
    childProfileId: row.childProfileId,
    childName: row.childName,
    enabled: row.enabled ?? false,
    wordsPerDay: row.wordsPerDay ?? 5,
    idiomsPerDay: row.idiomsPerDay ?? 5,
    wordLevel: row.wordLevel ?? "L1",
    idiomLevel: row.idiomLevel ?? "L1",
    activeDays: row.activeDays ?? [0, 1, 2, 3, 4, 5, 6],
    publishMode: row.publishMode === "automatic" ? "automatic" as const : "manual" as const,
  }))
}

export async function saveParentAiVocabularySettings(input: {
  childProfileId: string
  enabled: boolean
  wordsPerDay: number
  idiomsPerDay: number
  wordLevel: string
  idiomLevel: string
  activeDays: number[]
  publishMode: "manual" | "automatic"
}) {
  const child = await requireOwnedChild(input?.childProfileId)
  if (typeof input.enabled !== "boolean" ||
      !Number.isInteger(input.wordsPerDay) || input.wordsPerDay < 0 || input.wordsPerDay > 30 ||
      !Number.isInteger(input.idiomsPerDay) || input.idiomsPerDay < 0 || input.idiomsPerDay > 30 ||
      !LEVELS.has(input.wordLevel) || !LEVELS.has(input.idiomLevel) ||
      !Array.isArray(input.activeDays) || input.activeDays.length > 7 ||
      input.activeDays.some((day) => !Number.isInteger(day) || !DAY_VALUES.has(day)) ||
      new Set(input.activeDays).size !== input.activeDays.length ||
      !["manual", "automatic"].includes(input.publishMode)) {
    throw new Error("AI 추천 어휘 설정값을 확인해 주세요.")
  }

  const activeDays = [...input.activeDays].sort((a, b) => a - b)
  await db.transaction(async (tx) => {
    await tx.insert(aiVocabularySettings).values({
      childProfileId: child.id,
      enabled: input.enabled,
      wordsPerDay: input.wordsPerDay,
      idiomsPerDay: input.idiomsPerDay,
      wordLevel: input.wordLevel,
      idiomLevel: input.idiomLevel,
      activeDays,
      publishMode: input.publishMode,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: aiVocabularySettings.childProfileId,
      set: {
        enabled: input.enabled,
        wordsPerDay: input.wordsPerDay,
        idiomsPerDay: input.idiomsPerDay,
        wordLevel: input.wordLevel,
        idiomLevel: input.idiomLevel,
        activeDays,
        publishMode: input.publishMode,
        updatedAt: new Date(),
      },
    })

    if (input.enabled) {
      const [aiSubject] = await tx.select({ id: childSubjects.id }).from(childSubjects)
        .where(and(eq(childSubjects.childProfileId, child.id), eq(childSubjects.isAiVocabulary, true)))
        .limit(1)

      if (aiSubject) {
        await tx.update(childSubjects).set({ isArchived: false, updatedAt: new Date() })
          .where(and(eq(childSubjects.id, aiSubject.id), eq(childSubjects.childProfileId, child.id)))
      } else {
        const currentSubjects = await tx.select({ name: childSubjects.name, sortOrder: childSubjects.sortOrder }).from(childSubjects)
          .where(eq(childSubjects.childProfileId, child.id))
        const usedNames = new Set(currentSubjects.map((item) => item.name))
        let subjectName = "AI 추천 어휘"
        let suffix = 0
        while (usedNames.has(subjectName)) {
          suffix += 1
          subjectName = `AI 추천 어휘 (추천 ${suffix})`
        }
        const sortOrder = currentSubjects.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
        await tx.insert(childSubjects).values({
          childProfileId: child.id,
          name: subjectName,
          sortOrder,
          calendarColor: "#0D9488",
          isAiVocabulary: true,
        })
      }
    } else {
      await tx.update(childSubjects).set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(childSubjects.childProfileId, child.id), eq(childSubjects.isAiVocabulary, true), eq(childSubjects.isArchived, false)))
    }
  })

  revalidatePath("/parent")
  revalidatePath("/child")
  return { success: true }
}


type CandidateLexicalType = "word" | "idiom" | "phrasal_verb" | "collocation"

/**
 * Adds dictionary-backed definitions to the shared candidate pool.
 * Dictionary presence is not a difficulty rating or editorial approval.
 */
export async function lookupAndStageVocabularyCandidate(expressionInput: string, lexicalType: CandidateLexicalType) {
  await requireParentFamily()
  if (typeof expressionInput !== "string" || !["word", "idiom", "phrasal_verb", "collocation"].includes(lexicalType)) {
    throw new Error("영어 표현과 유형을 확인해 주세요.")
  }
  const expression = normalizeDictionaryExpression(expressionInput)
  if (!expression || expression.length > 100) throw new Error("영어 표현은 1~100자로 입력해 주세요.")

  const lookup = await lookupFreeDictionaryCached(expression)
  if (lookup.status !== "found") return lookup

  const rows = lookup.senses.map((sense) => ({
    expression: lookup.word,
    normalizedExpression: expression,
    lexicalType,
    partOfSpeech: sense.partOfSpeech || "unknown",
    senseKey: createHash("sha256").update(sense.definition.toLocaleLowerCase("en-US")).digest("hex").slice(0, 24),
    definitionEn: sense.definition,
    meaningKo: null,
    exampleSentence: sense.examples[0] ?? null,
    difficultyVerified: false,
    verificationStatus: "dictionary_found",
    sourceName: "FreeDictionaryAPI.com",
    sourceEntryUrl: lookup.sourceUrl,
    licenseName: lookup.licenseName,
    licenseUrl: lookup.licenseUrl,
    sourcePayload: {
      partOfSpeech: sense.partOfSpeech,
      definition: sense.definition,
      examples: sense.examples,
    },
    dictionaryFetchedAt: new Date(),
  }))

  const inserted = await db.insert(vocabularyCandidates).values(rows).onConflictDoNothing().returning({ id: vocabularyCandidates.id })
  revalidatePath("/parent")
  return {
    status: "found" as const,
    word: lookup.word,
    sensesFound: rows.length,
    added: inserted.length,
    alreadyExists: rows.length - inserted.length,
    sourceUrl: lookup.sourceUrl,
    licenseName: lookup.licenseName,
    licenseUrl: lookup.licenseUrl,
  }
}
