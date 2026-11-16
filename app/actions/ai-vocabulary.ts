"use server"

import { createHash } from "node:crypto"
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { aiVocabularyBundleItems, aiVocabularyBundles, aiVocabularySettings, aiVocabularyLevelAssessments, childProfiles, childSubjects, families, familyMembers, vocabularyCandidates, wordEntries } from "@/lib/db/schema"
import { normalizeDictionaryExpression } from "@/lib/free-dictionary-api"
import { lookupFreeDictionaryCached } from "@/lib/free-dictionary-cache"
import { generateAiVocabularyBundleForChild } from "@/lib/ai-vocabulary-engine"

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
  const [child] = await db.select({
    id: childProfiles.id,
    displayName: childProfiles.displayName,
    ownerUserId: families.ownerUserId,
  }).from(childProfiles)
    .innerJoin(families, eq(childProfiles.familyId, families.id))
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

  const assessments = await db.select({
    childProfileId: aiVocabularyLevelAssessments.childProfileId,
    lexicalType: aiVocabularyLevelAssessments.lexicalType,
    assignedLevel: aiVocabularyLevelAssessments.assignedLevel,
    questionCount: aiVocabularyLevelAssessments.questionCount,
    correctCount: aiVocabularyLevelAssessments.correctCount,
    confidence: aiVocabularyLevelAssessments.confidence,
    completedAt: aiVocabularyLevelAssessments.completedAt,
  }).from(aiVocabularyLevelAssessments)
    .innerJoin(childProfiles, eq(aiVocabularyLevelAssessments.childProfileId, childProfiles.id))
    .where(and(eq(childProfiles.familyId, family.id), eq(aiVocabularyLevelAssessments.status, "completed")))
    .orderBy(desc(aiVocabularyLevelAssessments.completedAt))

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
    latestWordAssessment: assessments.find((item) => item.childProfileId === row.childProfileId && item.lexicalType === "word") ?? null,
    latestIdiomAssessment: assessments.find((item) => item.childProfileId === row.childProfileId && item.lexicalType === "idiom") ?? null,
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
      (input.enabled && input.wordsPerDay + input.idiomsPerDay < 1) ||
      !LEVELS.has(input.wordLevel) || !LEVELS.has(input.idiomLevel) ||
      !Array.isArray(input.activeDays) || input.activeDays.length > 7 ||
      input.activeDays.some((day) => !Number.isInteger(day) || !DAY_VALUES.has(day)) ||
      new Set(input.activeDays).size !== input.activeDays.length ||
      !["manual", "automatic"].includes(input.publishMode)) {
    throw new Error(input.enabled && input.wordsPerDay + input.idiomsPerDay < 1 ? "AI 추천 학습을 켤 때는 하루 단어 또는 숙어를 하나 이상 설정해 주세요." : "AI 추천 어휘 설정값을 확인해 주세요.")
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


const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
const VOCABULARY_DOMAINS = new Set([
  "general", "advanced", "business", "academic", "professional",
  "medical", "biology", "chemistry", "engineering", "law",
])

export async function getParentVocabularyCandidateQueue() {
  await requireParentFamily()
  return db.select({
    id: vocabularyCandidates.id,
    expression: vocabularyCandidates.expression,
    lexicalType: vocabularyCandidates.lexicalType,
    partOfSpeech: vocabularyCandidates.partOfSpeech,
    definitionEn: vocabularyCandidates.definitionEn,
    disambiguation: vocabularyCandidates.disambiguation,
    exampleSentence: vocabularyCandidates.exampleSentence,
    sourceName: vocabularyCandidates.sourceName,
    sourceEntryUrl: vocabularyCandidates.sourceEntryUrl,
    licenseName: vocabularyCandidates.licenseName,
    licenseUrl: vocabularyCandidates.licenseUrl,
    createdAt: vocabularyCandidates.createdAt,
  }).from(vocabularyCandidates)
    .where(eq(vocabularyCandidates.verificationStatus, "dictionary_found"))
    .orderBy(desc(vocabularyCandidates.createdAt))
    .limit(50)
}

/** Parent curation is explicit; only reviewed candidates with an assigned level may enter recommendation selection. */
export async function reviewVocabularyCandidate(input: {
  candidateId: string
  decision: "approve" | "reject"
  meaningKo?: string
  disambiguation?: string
  childLevel?: string
  cefrLevel?: string
  domain?: string
  difficultyVerified?: boolean
}) {
  const { userId } = await requireParentFamily()
  if (typeof input?.candidateId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.candidateId) ||
      !["approve", "reject"].includes(input.decision)) {
    throw new Error("어휘 후보 검토 정보가 올바르지 않습니다.")
  }

  const now = new Date()
  const changes = input.decision === "reject"
    ? {
        verificationStatus: "rejected",
        difficultyVerified: false,
        reviewedByUserId: userId,
        verifiedAt: now,
        updatedAt: now,
      }
    : (() => {
        const meaningKo = typeof input.meaningKo === "string" ? input.meaningKo.trim() : ""
        const disambiguation = input.disambiguation?.trim() ?? ""
        const childLevel = input.childLevel?.trim() ?? ""
        const cefrLevel = input.cefrLevel?.trim() ?? ""
        const domain = input.domain?.trim() ?? ""
        const difficultyVerified = input.difficultyVerified === true
        if (!meaningKo || meaningKo.length > 200 || disambiguation.length > 100 ||
            (childLevel && !LEVELS.has(childLevel)) ||
            (cefrLevel && !CEFR_LEVELS.has(cefrLevel)) ||
            (domain && !VOCABULARY_DOMAINS.has(domain)) ||
            (difficultyVerified && !childLevel && !cefrLevel)) {
          throw new Error("한국어 뜻과 난이도 검토 정보를 확인해 주세요.")
        }
        return {
          verificationStatus: "approved",
          meaningKo,
          disambiguation: disambiguation || null,
          childLevel: childLevel || null,
          cefrLevel: cefrLevel || null,
          domain: domain || null,
          difficultyVerified,
          reviewedByUserId: userId,
          verifiedAt: now,
          updatedAt: now,
        }
      })()

  const [updated] = await db.update(vocabularyCandidates).set(changes)
    .where(and(
      eq(vocabularyCandidates.id, input.candidateId),
      eq(vocabularyCandidates.verificationStatus, "dictionary_found"),
    ))
    .returning({ id: vocabularyCandidates.id })
  if (!updated) throw new Error("이미 검토했거나 어휘 후보를 찾을 수 없습니다.")

  revalidatePath("/parent")
  return { success: true, decision: input.decision }
}


function todayInSeoul(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function shuffleItems<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}


export async function getParentAiVocabularyBundles(childProfileId?: string) {
  const { family } = await requireParentFamily()
  const conditions = childProfileId
    ? and(eq(childProfiles.familyId, family.id), eq(aiVocabularyBundles.childProfileId, childProfileId))
    : eq(childProfiles.familyId, family.id)
  const bundles = await db.select({
    id: aiVocabularyBundles.id,
    childProfileId: childProfiles.id,
    childName: childProfiles.displayName,
    studyDate: aiVocabularyBundles.studyDate,
    status: aiVocabularyBundles.status,
    createdAt: aiVocabularyBundles.createdAt,
  }).from(aiVocabularyBundles)
    .innerJoin(childProfiles, eq(aiVocabularyBundles.childProfileId, childProfiles.id))
    .where(conditions)
    .orderBy(desc(aiVocabularyBundles.createdAt))
    .limit(30)

  if (!bundles.length) return []
  const bundleIds = bundles.map((bundle) => bundle.id)
  const items = await db.select({
    id: aiVocabularyBundleItems.id,
    bundleId: aiVocabularyBundleItems.bundleId,
    sourceType: aiVocabularyBundleItems.sourceType,
    lexicalType: aiVocabularyBundleItems.lexicalType,
    expression: aiVocabularyBundleItems.expressionSnapshot,
    meaning: aiVocabularyBundleItems.meaningSnapshot,
    disambiguation: aiVocabularyBundleItems.disambiguationSnapshot,
    example: aiVocabularyBundleItems.exampleSnapshot,
    sortOrder: aiVocabularyBundleItems.sortOrder,
  }).from(aiVocabularyBundleItems)
    .where(inArray(aiVocabularyBundleItems.bundleId, bundleIds))
    .orderBy(asc(aiVocabularyBundleItems.sortOrder))
  const itemsByBundle = new Map<string, typeof items>()
  for (const item of items) {
    const current = itemsByBundle.get(item.bundleId) ?? []
    current.push(item)
    itemsByBundle.set(item.bundleId, current)
  }

  return bundles.map((bundle) => ({
    ...bundle,
    itemCount: itemsByBundle.get(bundle.id)?.length ?? 0,
    items: itemsByBundle.get(bundle.id) ?? [],
  }))
}

/**
 * Build a complete daily set in one transaction. No unverified candidate is
 * ever substituted; wrong answers from the same child are the only fallback.
 * Manual mode stores a private pending bundle until a parent publishes it.
 */
export async function generateParentAiVocabularyBundle(childProfileId: string) {
  const child = await requireOwnedChild(childProfileId)
  const result = await generateAiVocabularyBundleForChild(child.id)
  revalidatePath("/parent")
  revalidatePath("/child")
  return result
}

export async function reviewParentAiVocabularyBundle(input: {
  childProfileId: string
  bundleId: string
  decision: "publish" | "reject"
}) {
  const child = await requireOwnedChild(input?.childProfileId)
  if (typeof input.bundleId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.bundleId) ||
      !["publish", "reject"].includes(input.decision)) {
    throw new Error("추천 묶음 검토 정보가 올바르지 않습니다.")
  }

  const result = await db.transaction(async (tx) => {
    const [bundle] = await tx.select().from(aiVocabularyBundles).where(and(
      eq(aiVocabularyBundles.id, input.bundleId),
      eq(aiVocabularyBundles.childProfileId, child.id),
      eq(aiVocabularyBundles.status, "pending_approval"),
    )).for("update").limit(1)
    if (!bundle) throw new Error("검토 대기 중인 추천 묶음을 찾을 수 없습니다.")

    if (input.decision === "reject") {
      await tx.update(aiVocabularyBundles).set({ status: "rejected", updatedAt: new Date() })
        .where(eq(aiVocabularyBundles.id, bundle.id))
      return { status: "rejected" as const }
    }

    const [settings] = await tx.select().from(aiVocabularySettings)
      .where(eq(aiVocabularySettings.childProfileId, child.id)).limit(1)
    if (!settings?.enabled) throw new Error("AI 추천 학습이 비활성화되어 있습니다.")

    const [subject] = await tx.select().from(childSubjects).where(and(
      eq(childSubjects.childProfileId, child.id),
      eq(childSubjects.isAiVocabulary, true),
      eq(childSubjects.isArchived, false),
    )).limit(1)
    if (!subject) throw new Error("AI 추천 과목을 찾을 수 없습니다.")

    const items = await tx.select().from(aiVocabularyBundleItems)
      .where(eq(aiVocabularyBundleItems.bundleId, bundle.id))
      .orderBy(asc(aiVocabularyBundleItems.sortOrder))
    if (!items.length) throw new Error("추천 묶음에 등록된 표현이 없습니다.")

    for (const item of items) {
      if (item.candidateId) {
        const [candidate] = await tx.select({ verificationStatus: vocabularyCandidates.verificationStatus, difficultyVerified: vocabularyCandidates.difficultyVerified })
          .from(vocabularyCandidates).where(eq(vocabularyCandidates.id, item.candidateId)).limit(1)
        if (!candidate || candidate.verificationStatus !== "approved" || !candidate.difficultyVerified) {
          throw new Error("검증 상태가 변경된 후보가 포함되어 있어 게시할 수 없습니다.")
        }
      }
    }

    const insertedWords = await tx.insert(wordEntries).values(items.map((item) => ({
      userId: child.ownerUserId,
      childProfileId: child.id,
      profile: child.displayName,
      assignmentDate: bundle.studyDate,
      subjectId: subject.id,
      subject: subject.name,
      word: item.expressionSnapshot,
      meaning: item.meaningSnapshot,
      disambiguation: item.disambiguationSnapshot,
      example: item.exampleSnapshot,
      lexicalType: item.lexicalType,
      vocabularyCandidateId: item.candidateId,
    }))).returning({ id: wordEntries.id })
    if (insertedWords.length !== items.length) throw new Error("추천 단어를 모두 저장하지 못했습니다.")

    for (let index = 0; index < items.length; index += 1) {
      await tx.update(aiVocabularyBundleItems).set({ wordEntryId: insertedWords[index].id })
        .where(eq(aiVocabularyBundleItems.id, items[index].id))
    }
    await tx.update(aiVocabularyBundles).set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(aiVocabularyBundles.id, bundle.id))
    return { status: "published" as const, itemCount: items.length }
  })

  revalidatePath("/parent")
  revalidatePath("/child")
  return result
}
