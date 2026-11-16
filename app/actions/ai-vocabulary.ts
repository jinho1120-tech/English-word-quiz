"use server"

import { createHash } from "node:crypto"
import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { aiVocabularySettings, childProfiles, childSubjects, families, familyMembers, dictionaryLookupCache, vocabularyCandidates } from "@/lib/db/schema"
import { lookupFreeDictionary, normalizeDictionaryExpression, type DictionaryLookupResult } from "@/lib/free-dictionary-api"
import { getClientRateLimitKey } from "@/lib/client-ip"
import { consumeRateLimit } from "@/lib/rate-limit"

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
  await db.insert(aiVocabularySettings).values({
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
    const [aiSubject] = await db.select({ id: childSubjects.id }).from(childSubjects)
      .where(and(eq(childSubjects.childProfileId, child.id), eq(childSubjects.isAiVocabulary, true)))
      .limit(1)

    if (aiSubject) {
      await db.update(childSubjects).set({ isArchived: false, updatedAt: new Date() })
        .where(and(eq(childSubjects.id, aiSubject.id), eq(childSubjects.childProfileId, child.id)))
    } else {
      const currentSubjects = await db.select({ name: childSubjects.name, sortOrder: childSubjects.sortOrder }).from(childSubjects)
        .where(eq(childSubjects.childProfileId, child.id))
      const usedNames = new Set(currentSubjects.map((item) => item.name))
      let subjectName = "AI 추천 어휘"
      let suffix = 1
      while (usedNames.has(subjectName)) {
        suffix += 1
        subjectName = `AI 추천 어휘 (추천 ${suffix})`
      }
      const sortOrder = currentSubjects.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
      await db.insert(childSubjects).values({
        childProfileId: child.id,
        name: subjectName,
        sortOrder,
        calendarColor: "#0D9488",
        isAiVocabulary: true,
      })
    }
  } else {
    await db.update(childSubjects).set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(childSubjects.childProfileId, child.id), eq(childSubjects.isAiVocabulary, true), eq(childSubjects.isArchived, false)))
  }

  revalidatePath("/parent")
  revalidatePath("/child")
  return { success: true }
}


type CandidateLexicalType = "word" | "idiom" | "phrasal_verb" | "collocation"

function isCachedDictionaryPayload(value: unknown): value is {
  word: string
  senses: { partOfSpeech: string; definition: string; examples: string[] }[]
  sourceUrl: string
  licenseName: string
  licenseUrl: string
} {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return typeof row.word === "string" &&
    typeof row.sourceUrl === "string" &&
    typeof row.licenseName === "string" &&
    typeof row.licenseUrl === "string" &&
    Array.isArray(row.senses) &&
    row.senses.every((sense) => {
      if (!sense || typeof sense !== "object") return false
      const item = sense as Record<string, unknown>
      return typeof item.partOfSpeech === "string" &&
        typeof item.definition === "string" &&
        Array.isArray(item.examples) &&
        item.examples.every((example) => typeof example === "string")
    })
}

async function lookupDictionaryWithCache(expression: string): Promise<DictionaryLookupResult> {
  const normalizedExpression = normalizeDictionaryExpression(expression)
  const [cached] = await db.select().from(dictionaryLookupCache)
    .where(eq(dictionaryLookupCache.normalizedExpression, normalizedExpression))
    .limit(1)
  const now = new Date()

  if (cached && cached.expiresAt > now) {
    if (cached.lookupStatus === "not_found") return { status: "not_found", word: normalizedExpression }
    if (cached.lookupStatus === "found" && isCachedDictionaryPayload(cached.responsePayload)) {
      return {
        status: "found",
        word: cached.responsePayload.word,
        senses: cached.responsePayload.senses,
        sourceUrl: cached.responsePayload.sourceUrl,
        licenseName: cached.responsePayload.licenseName,
        licenseUrl: cached.responsePayload.licenseUrl,
        payload: cached.responsePayload as Record<string, unknown>,
      }
    }
  }

  const ip = await getClientRateLimitKey()
  const budget = await consumeRateLimit(ip.key, "free-dictionary-api", 45, 3600)
  if (!budget.allowed) return { status: "unavailable", word: normalizedExpression, reason: "rate_limited" }

  const result = await lookupFreeDictionary(normalizedExpression)
  if (result.status === "unavailable") return result

  const expiresAt = new Date(now.getTime() + (result.status === "found" ? 30 : 1) * 24 * 60 * 60 * 1000)
  const responsePayload = result.status === "found"
    ? {
        word: result.word,
        senses: result.senses,
        sourceUrl: result.sourceUrl,
        licenseName: result.licenseName,
        licenseUrl: result.licenseUrl,
      }
    : {}

  await db.insert(dictionaryLookupCache).values({
    normalizedExpression,
    lookupStatus: result.status,
    responsePayload,
    sourceUrl: result.status === "found" ? result.sourceUrl : null,
    licenseName: result.status === "found" ? result.licenseName : "CC BY-SA 4.0",
    licenseUrl: result.status === "found" ? result.licenseUrl : "https://creativecommons.org/licenses/by-sa/4.0/",
    checkedAt: now,
    expiresAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: dictionaryLookupCache.normalizedExpression,
    set: {
      lookupStatus: result.status,
      responsePayload,
      sourceUrl: result.status === "found" ? result.sourceUrl : null,
      licenseName: result.status === "found" ? result.licenseName : "CC BY-SA 4.0",
      licenseUrl: result.status === "found" ? result.licenseUrl : "https://creativecommons.org/licenses/by-sa/4.0/",
      checkedAt: now,
      expiresAt,
      updatedAt: now,
    },
  })

  return result
}

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

  const lookup = await lookupDictionaryWithCache(expression)
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
