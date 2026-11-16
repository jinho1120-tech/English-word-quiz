import "server-only"

import { and, asc, desc, eq, gt, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiVocabularyBundleItems, aiVocabularyBundles, aiVocabularySettings, childProfiles, childSubjects, families, vocabularyCandidates, wordEntries } from "@/lib/db/schema"
import { normalizeDictionaryExpression } from "@/lib/free-dictionary-api"

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

export async function generateAiVocabularyBundleForChild(childProfileId: string) {
  const [child] = await db.select({
    id: childProfiles.id,
    displayName: childProfiles.displayName,
    ownerUserId: families.ownerUserId,
  }).from(childProfiles)
    .innerJoin(families, eq(childProfiles.familyId, families.id))
    .where(eq(childProfiles.id, childProfileId))
    .limit(1)
  if (!child) return { status: "child_missing" as const }
  const today = todayInSeoul()

  return db.transaction(async (tx) => {
    const [settings] = await tx.select().from(aiVocabularySettings)
      .where(eq(aiVocabularySettings.childProfileId, child.id))
      .limit(1)
    if (!settings?.enabled) return { status: "disabled" as const }
    const activeDays = Array.isArray(settings.activeDays) ? settings.activeDays : []
    const weekday = new Date(`${today}T12:00:00+09:00`).getDay()
    if (!activeDays.includes(weekday)) return { status: "not_scheduled" as const }

    const bundles = await tx.select().from(aiVocabularyBundles)
      .where(eq(aiVocabularyBundles.childProfileId, child.id))
      .orderBy(desc(aiVocabularyBundles.studyDate), desc(aiVocabularyBundles.createdAt))
    const todayBundle = bundles.find((bundle) => bundle.studyDate === today)
    if (todayBundle) return { status: "already_exists" as const, bundleId: todayBundle.id, bundleStatus: todayBundle.status }

    const unfinished = bundles.find((bundle) => bundle.status !== "completed" && bundle.status !== "rejected")
    if (unfinished) {
      return { status: "unfinished_exists" as const, studyDate: unfinished.studyDate, bundleStatus: unfinished.status }
    }

    const [aiSubject] = await tx.select().from(childSubjects).where(and(
      eq(childSubjects.childProfileId, child.id),
      eq(childSubjects.isAiVocabulary, true),
      eq(childSubjects.isArchived, false),
    )).limit(1)
    if (!aiSubject) return { status: "subject_missing" as const }

    const [usedRows, existingWords] = await Promise.all([
      tx.select({
        candidateId: aiVocabularyBundleItems.candidateId,
        sourceWordEntryId: aiVocabularyBundleItems.sourceWordEntryId,
      }).from(aiVocabularyBundleItems)
        .innerJoin(aiVocabularyBundles, eq(aiVocabularyBundleItems.bundleId, aiVocabularyBundles.id))
        .where(eq(aiVocabularyBundles.childProfileId, child.id)),
      tx.select({
        word: wordEntries.word,
        lexicalType: wordEntries.lexicalType,
        subjectId: wordEntries.subjectId,
      }).from(wordEntries).where(and(
        eq(wordEntries.childProfileId, child.id),
        eq(wordEntries.userId, child.ownerUserId),
      )),

    ])

    const usedCandidateIds = new Set(usedRows.map((row) => row.candidateId).filter((value): value is string => Boolean(value)))
    const usedWrongWordIds = new Set(usedRows.map((row) => row.sourceWordEntryId).filter((value): value is number => value !== null))
    const existingKeys = new Set(existingWords.map((row) => `${normalizeDictionaryExpression(row.word)}|${row.lexicalType}`))

    const [candidates, wrongWords] = await Promise.all([
      tx.select().from(vocabularyCandidates).where(and(
        eq(vocabularyCandidates.verificationStatus, "approved"),
        eq(vocabularyCandidates.difficultyVerified, true),
        isNotNull(vocabularyCandidates.meaningKo),
        inArray(vocabularyCandidates.lexicalType, ["word", "idiom", "phrasal_verb", "collocation"]),
      )),
      tx.select().from(wordEntries).where(and(
        eq(wordEntries.childProfileId, child.id),
        eq(wordEntries.userId, child.ownerUserId),
        gt(wordEntries.wrongCount, 0),
      )).orderBy(desc(wordEntries.wrongCount), desc(wordEntries.createdAt)),
    ])

    const selected: {
      candidateId: string | null
      sourceWordEntryId: number | null
      sourceType: "candidate" | "wrong_word"
      lexicalType: string
      expression: string
      meaning: string
      disambiguation: string | null
      example: string | null
    }[] = []

    const shortage: { words: number; idioms: number } = { words: 0, idioms: 0 }
    const targets = [
      { group: "words" as const, count: settings.wordsPerDay, level: settings.wordLevel, types: ["word"] },
      { group: "idioms" as const, count: settings.idiomsPerDay, level: settings.idiomLevel, types: ["idiom", "phrasal_verb", "collocation"] },
    ]

    for (const target of targets) {
      if (!target.count) continue
      const currentLevelCount = target.level === "L6" ? target.count : Math.ceil(target.count * 0.7)
      const nextLevel = target.level === "L6"
        ? "L6"
        : `L${Number(target.level.slice(1)) + 1}`
      const candidatesForGroup = candidates.filter((candidate) =>
        target.types.includes(candidate.lexicalType) &&
        candidate.meaningKo?.trim() &&
        !usedCandidateIds.has(candidate.id) &&
        !existingKeys.has(`${candidate.normalizedExpression}|${candidate.lexicalType}`),
      )
      const currentLevel = shuffleItems(candidatesForGroup.filter((candidate) => candidate.childLevel === target.level))
      const nextLevelCandidates = target.level === "L6"
        ? []
        : shuffleItems(candidatesForGroup.filter((candidate) => candidate.childLevel === nextLevel))
      const chosen = [
        ...currentLevel.slice(0, currentLevelCount),
        ...nextLevelCandidates.slice(0, target.count - currentLevelCount),
      ]
      const missing = target.count - chosen.length

      for (const candidate of chosen) {
        selected.push({
          candidateId: candidate.id,
          sourceWordEntryId: null,
          sourceType: "candidate",
          lexicalType: candidate.lexicalType,
          expression: candidate.expression,
          meaning: candidate.meaningKo!,
          disambiguation: candidate.disambiguation,
          example: candidate.exampleSentence,
        })
      }

      if (missing > 0) {
        const wrongFallback = wrongWords.filter((word) =>
          target.types.includes(word.lexicalType) &&
          !usedWrongWordIds.has(word.id) &&
          !selected.some((item) => item.sourceWordEntryId === word.id) &&
          word.subjectId !== aiSubject.id,
        ).slice(0, missing)
        for (const word of wrongFallback) {
          selected.push({
            candidateId: null,
            sourceWordEntryId: word.id,
            sourceType: "wrong_word",
            lexicalType: word.lexicalType,
            expression: word.word,
            meaning: word.meaning,
            disambiguation: word.disambiguation,
            example: word.example,
          })
        }
        const unfilled = missing - wrongFallback.length
        if (unfilled > 0) shortage[target.group] = unfilled
      }
    }

    if (shortage.words || shortage.idioms) {
      return {
        status: "waiting_for_candidates" as const,
        shortage,
        required: { words: settings.wordsPerDay, idioms: settings.idiomsPerDay },
        available: { words: settings.wordsPerDay - shortage.words, idioms: settings.idiomsPerDay - shortage.idioms },
      }
    }

    const [bundle] = await tx.insert(aiVocabularyBundles).values({
      childProfileId: child.id,
      studyDate: today,
      status: settings.publishMode === "automatic" ? "published" : "pending_approval",
      publishedAt: settings.publishMode === "automatic" ? new Date() : null,
    }).returning({ id: aiVocabularyBundles.id })
    if (!bundle) throw new Error("오늘의 추천 묶음을 만들지 못했습니다.")

    const itemRows = selected.map((item, index) => ({
      bundleId: bundle.id,
      candidateId: item.candidateId,
      sourceWordEntryId: item.sourceWordEntryId,
      sourceType: item.sourceType,
      lexicalType: item.lexicalType,
      expressionSnapshot: item.expression,
      meaningSnapshot: item.meaning,
      disambiguationSnapshot: item.disambiguation,
      exampleSnapshot: item.example,
      sortOrder: index,
    }))
    await tx.insert(aiVocabularyBundleItems).values(itemRows)

    if (settings.publishMode === "automatic") {
      const insertedWords = await tx.insert(wordEntries).values(selected.map((item) => ({
        userId: child.ownerUserId,
        childProfileId: child.id,
        profile: child.displayName,
        assignmentDate: today,
        subjectId: aiSubject.id,
        subject: aiSubject.name,
        word: item.expression,
        meaning: item.meaning,
        disambiguation: item.disambiguation,
        example: item.example,
        lexicalType: item.lexicalType,
        vocabularyCandidateId: item.candidateId,
      }))).returning({ id: wordEntries.id })
      if (insertedWords.length !== selected.length) throw new Error("추천 단어를 모두 저장하지 못했습니다.")
      for (let index = 0; index < insertedWords.length; index += 1) {
        await tx.update(aiVocabularyBundleItems).set({ wordEntryId: insertedWords[index].id })
          .where(and(eq(aiVocabularyBundleItems.bundleId, bundle.id), eq(aiVocabularyBundleItems.sortOrder, index)))
      }
    }

    return {
      status: settings.publishMode === "automatic" ? "published" as const : "pending_approval" as const,
      bundleId: bundle.id,
      itemCount: selected.length,
      words: settings.wordsPerDay,
      idioms: settings.idiomsPerDay,
    }
  })
}
