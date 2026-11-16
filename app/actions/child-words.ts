"use server"

import { randomInt, randomUUID } from "node:crypto"
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { OWL_GAME_NAME } from "@/components/arcade/game-branding"
import { childPacmanDailyPlays, childProfiles, childGamePlays, childQuizAttempts, childSubjects, couponRewards, couponTypes, childCouponSettings, familyArcadeSettings, wordEntries, childWordFavorites, childWordSubmissions, aiVocabularyBundles, aiVocabularyBundleItems, aiVocabularySettings, aiVocabularyLevelAssessments, vocabularyCandidates } from "@/lib/db/schema"
import { consumeUserRateLimit } from "@/lib/rate-limit"
import { extractWordsFromImage } from "@/lib/ai-word-scan"
import { getChildDeviceSession } from "@/lib/child-auth"
import { lookupFreeDictionaryCached } from "@/lib/free-dictionary-cache"
import { normalizeDictionaryExpression } from "@/lib/free-dictionary-api"
import { notifyFamilyParents } from "@/lib/notifications"

const SUBJECT_CALENDAR_COLORS = ["#2563EB", "#16A34A", "#F59E0B", "#EF4444", "#A855F7", "#EC4899", "#0D9488", "#64748B"]

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
  const [created] = await db.insert(childSubjects).values({ childProfileId: child.childProfileId, name, sortOrder, calendarColor: SUBJECT_CALENDAR_COLORS[sortOrder % SUBJECT_CALENDAR_COLORS.length] }).returning()
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
  const allWordsRaw = await db.select().from(wordEntries)
    .where(and(
      eq(wordEntries.userId, child.ownerUserId),
      eq(wordEntries.childProfileId, child.childProfileId),
    ))
    .orderBy(asc(wordEntries.createdAt))
  const candidateIds = [...new Set(allWordsRaw
    .map((word) => word.vocabularyCandidateId)
    .filter((id): id is string => Boolean(id)))]
  const candidateSources = candidateIds.length
    ? await db.select({
        id: vocabularyCandidates.id,
        sourceName: vocabularyCandidates.sourceName,
        sourceEntryUrl: vocabularyCandidates.sourceEntryUrl,
        licenseName: vocabularyCandidates.licenseName,
        licenseUrl: vocabularyCandidates.licenseUrl,
      }).from(vocabularyCandidates)
        .where(inArray(vocabularyCandidates.id, candidateIds))
    : []
  const sourceByCandidateId = new Map(candidateSources.map((source) => [source.id, source]))
  const allWords = allWordsRaw.map((word) => ({
    ...word,
    sourceName: word.vocabularyCandidateId ? sourceByCandidateId.get(word.vocabularyCandidateId)?.sourceName ?? null : null,
    sourceEntryUrl: word.vocabularyCandidateId ? sourceByCandidateId.get(word.vocabularyCandidateId)?.sourceEntryUrl ?? null : null,
    licenseName: word.vocabularyCandidateId ? sourceByCandidateId.get(word.vocabularyCandidateId)?.licenseName ?? null : null,
    licenseUrl: word.vocabularyCandidateId ? sourceByCandidateId.get(word.vocabularyCandidateId)?.licenseUrl ?? null : null,
  }))
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
  let aiBundle: typeof aiVocabularyBundles.$inferSelect | null = null
  if (date === todayInSeoulForAiVocabulary()) {
    const [todayBundle] = await db.select().from(aiVocabularyBundles).where(and(
      eq(aiVocabularyBundles.childProfileId, child.childProfileId),
      eq(aiVocabularyBundles.studyDate, date),
      inArray(aiVocabularyBundles.status, ["published", "cards_completed", "quiz_in_progress", "completed"]),
    )).limit(1)
    aiBundle = todayBundle ?? null
  }
  const aiBundleItems = aiBundle
    ? await db.select({
        id: aiVocabularyBundleItems.id,
        bundleId: aiVocabularyBundleItems.bundleId,
        candidateId: aiVocabularyBundleItems.candidateId,
        wordEntryId: aiVocabularyBundleItems.wordEntryId,
        sourceWordEntryId: aiVocabularyBundleItems.sourceWordEntryId,
        sourceType: aiVocabularyBundleItems.sourceType,
        lexicalType: aiVocabularyBundleItems.lexicalType,
        expressionSnapshot: aiVocabularyBundleItems.expressionSnapshot,
        meaningSnapshot: aiVocabularyBundleItems.meaningSnapshot,
        disambiguationSnapshot: aiVocabularyBundleItems.disambiguationSnapshot,
        exampleSnapshot: aiVocabularyBundleItems.exampleSnapshot,
        sortOrder: aiVocabularyBundleItems.sortOrder,
        frontViewedAt: aiVocabularyBundleItems.frontViewedAt,
        backViewedAt: aiVocabularyBundleItems.backViewedAt,
        sourceName: vocabularyCandidates.sourceName,
        sourceEntryUrl: vocabularyCandidates.sourceEntryUrl,
        licenseName: vocabularyCandidates.licenseName,
        licenseUrl: vocabularyCandidates.licenseUrl,
      }).from(aiVocabularyBundleItems)
      .leftJoin(vocabularyCandidates, eq(aiVocabularyBundleItems.candidateId, vocabularyCandidates.id))
      .where(eq(aiVocabularyBundleItems.bundleId, aiBundle.id))
      .orderBy(asc(aiVocabularyBundleItems.sortOrder))
    : []
  const favoriteRows = await db.select({ wordEntryId: childWordFavorites.wordEntryId }).from(childWordFavorites)
    .where(eq(childWordFavorites.childProfileId, child.childProfileId))
  const [aiSettings] = await db.select({
    enabled: aiVocabularySettings.enabled,
    wordLevel: aiVocabularySettings.wordLevel,
    idiomLevel: aiVocabularySettings.idiomLevel,
  }).from(aiVocabularySettings).where(eq(aiVocabularySettings.childProfileId, child.childProfileId)).limit(1)
  const [latestWordAssessment] = await db.select({
    assignedLevel: aiVocabularyLevelAssessments.assignedLevel,
    questionCount: aiVocabularyLevelAssessments.questionCount,
    correctCount: aiVocabularyLevelAssessments.correctCount,
    confidence: aiVocabularyLevelAssessments.confidence,
    completedAt: aiVocabularyLevelAssessments.completedAt,
  }).from(aiVocabularyLevelAssessments).where(and(
    eq(aiVocabularyLevelAssessments.childProfileId, child.childProfileId),
    eq(aiVocabularyLevelAssessments.lexicalType, "word"),
    eq(aiVocabularyLevelAssessments.status, "completed"),
  )).orderBy(desc(aiVocabularyLevelAssessments.completedAt)).limit(1)
  const [latestIdiomAssessment] = await db.select({
    assignedLevel: aiVocabularyLevelAssessments.assignedLevel,
    questionCount: aiVocabularyLevelAssessments.questionCount,
    correctCount: aiVocabularyLevelAssessments.correctCount,
    confidence: aiVocabularyLevelAssessments.confidence,
    completedAt: aiVocabularyLevelAssessments.completedAt,
  }).from(aiVocabularyLevelAssessments).where(and(
    eq(aiVocabularyLevelAssessments.childProfileId, child.childProfileId),
    eq(aiVocabularyLevelAssessments.lexicalType, "idiom"),
    eq(aiVocabularyLevelAssessments.status, "completed"),
  )).orderBy(desc(aiVocabularyLevelAssessments.completedAt)).limit(1)
  const stats = {
    total: attempts.length,
    correct: correctCount,
    accuracy: attempts.length ? Math.round(correctCount / attempts.length * 100) : 0,
    subjects: Array.from(subjectStats.entries()).map(([name, value]) => ({ name, ...value, accuracy: Math.round(value.correct / value.total * 100) })),
  }
  return { childName: child.childName, subjects, words, allWords, wrongWords, favoriteWordIds: favoriteRows.map((row) => row.wordEntryId), todayAiBundle: aiBundle ? { ...aiBundle, items: aiBundleItems } : null, aiVocabularyAssessment: aiSettings?.enabled ? { wordLevel: aiSettings.wordLevel, idiomLevel: aiSettings.idiomLevel, latestWordAssessment, latestIdiomAssessment } : null, stats }
}

type AssessmentCandidate = {
  id: string
  expression: string
  meaningKo: string | null
  disambiguation: string | null
  lexicalType: string
  childLevel: string | null
}

type AssessmentQuestionState = {
  candidateId: string
  level: string
  optionIds: string[]
}

type AssessmentAnswerState = {
  candidateId: string
  level: string
  selectedOptionId: string
  correct: boolean
}

type AssessmentProgress = {
  combinedSessionId?: string
  currentLevel: string
  consecutiveCorrect: number
  askedCandidateIds: string[]
  answers: AssessmentAnswerState[]
  currentQuestion: AssessmentQuestionState | null
}

const ASSESSMENT_QUESTION_COUNT = 9
const ASSESSMENT_START_LEVEL = "L3"

function shuffleAssessmentItems<T>(items: T[]) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function assessmentLevelNumber(level: string) {
  const value = Number(level.replace("L", ""))
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 3
}

function assessmentOptionLabel(candidate: AssessmentCandidate) {
  return candidate.meaningKo?.trim()
    ? candidate.meaningKo.trim() + (candidate.disambiguation?.trim() ? " (" + candidate.disambiguation.trim() + ")" : "")
    : ""
}

function hasFourAssessmentOptions(prompt: AssessmentCandidate, candidates: AssessmentCandidate[]) {
  const labels = new Set<string>()
  for (const candidate of candidates) {
    if (candidate.lexicalType !== prompt.lexicalType) continue
    const label = assessmentOptionLabel(candidate).toLocaleLowerCase()
    if (label) labels.add(label)
  }
  return labels.size >= 4
}

function createAssessmentQuestion(
  candidates: AssessmentCandidate[],
  targetLevel: string,
  askedCandidateIds: string[],
  questionNumber: number,
) {
  const asked = new Set(askedCandidateIds)
  const levelCandidates = shuffleAssessmentItems(candidates.filter((candidate) =>
    candidate.childLevel === targetLevel && !asked.has(candidate.id) && hasFourAssessmentOptions(candidate, candidates),
  ))
  const levels = ["L1", "L2", "L3", "L4", "L5", "L6"]
    .sort((a, b) => Math.abs(assessmentLevelNumber(a) - assessmentLevelNumber(targetLevel)) - Math.abs(assessmentLevelNumber(b) - assessmentLevelNumber(targetLevel)))
  const orderedCandidates = [
    ...levelCandidates,
    ...levels.filter((level) => level !== targetLevel).flatMap((level) =>
      shuffleAssessmentItems(candidates.filter((candidate) => candidate.childLevel === level && !asked.has(candidate.id) && hasFourAssessmentOptions(candidate, candidates))),
    ),
  ]

  for (const prompt of orderedCandidates) {
    const promptLabel = assessmentOptionLabel(prompt)
    if (!promptLabel) continue
    const labels = new Set([promptLabel.toLocaleLowerCase()])
    const distractors = shuffleAssessmentItems(candidates.filter((candidate) =>
      candidate.id !== prompt.id &&
      candidate.lexicalType === prompt.lexicalType &&
      !labels.has(assessmentOptionLabel(candidate).toLocaleLowerCase()) &&
      Boolean(assessmentOptionLabel(candidate)),
    ))
    const options = [prompt]
    for (const candidate of distractors) {
      const label = assessmentOptionLabel(candidate).toLocaleLowerCase()
      if (labels.has(label)) continue
      labels.add(label)
      options.push(candidate)
      if (options.length === 4) break
    }
    if (options.length !== 4) continue
    const shuffledOptions = shuffleAssessmentItems(options)
    return {
      state: {
        candidateId: prompt.id,
        level: prompt.childLevel ?? targetLevel,
        optionIds: shuffledOptions.map((option) => option.id),
      } satisfies AssessmentQuestionState,
      publicQuestion: {
        number: questionNumber,
        total: ASSESSMENT_QUESTION_COUNT,
        expression: prompt.expression,
        options: shuffledOptions.map((option) => ({ id: option.id, label: assessmentOptionLabel(option) })),
      },
    }
  }
  return null
}

function assessmentProgress(value: Record<string, unknown>): AssessmentProgress {
  const current = value as Partial<AssessmentProgress>
  return {
    combinedSessionId: typeof current.combinedSessionId === "string" ? current.combinedSessionId : undefined,
    currentLevel: typeof current.currentLevel === "string" ? current.currentLevel : ASSESSMENT_START_LEVEL,
    consecutiveCorrect: Number.isInteger(current.consecutiveCorrect) ? current.consecutiveCorrect! : 0,
    askedCandidateIds: Array.isArray(current.askedCandidateIds) ? current.askedCandidateIds.filter((id): id is string => typeof id === "string") : [],
    answers: Array.isArray(current.answers) ? current.answers as AssessmentAnswerState[] : [],
    currentQuestion: current.currentQuestion && typeof current.currentQuestion === "object"
      ? current.currentQuestion as AssessmentQuestionState
      : null,
  }
}

function finalAssessmentLevel(answers: AssessmentAnswerState[]) {
  const recentLevels = answers.slice(-7).map((answer) => assessmentLevelNumber(answer.level)).sort((a, b) => a - b)
  const middle = Math.floor(recentLevels.length / 2)
  const level = recentLevels.length % 2
    ? recentLevels[middle]
    : Math.round((recentLevels[middle - 1] + recentLevels[middle]) / 2)
  const occurrences = recentLevels.filter((item) => item === level).length
  const spread = recentLevels.length ? recentLevels[recentLevels.length - 1] - recentLevels[0] : 5
  const confidence = occurrences >= 3 && spread <= 2 ? "high" : spread <= 3 ? "medium" : "low"
  return { level: "L" + Math.min(6, Math.max(1, level)), confidence }
}

async function loadAssessmentCandidates(lexicalType: "word" | "idiom") {
  const types = lexicalType === "word" ? ["word"] : ["idiom", "phrasal_verb", "collocation"]
  return db.select({
    id: vocabularyCandidates.id,
    expression: vocabularyCandidates.expression,
    meaningKo: vocabularyCandidates.meaningKo,
    disambiguation: vocabularyCandidates.disambiguation,
    lexicalType: vocabularyCandidates.lexicalType,
    childLevel: vocabularyCandidates.childLevel,
  }).from(vocabularyCandidates).where(and(
    eq(vocabularyCandidates.verificationStatus, "approved"),
    eq(vocabularyCandidates.difficultyVerified, true),
    isNotNull(vocabularyCandidates.meaningKo),
    isNotNull(vocabularyCandidates.childLevel),
    inArray(vocabularyCandidates.lexicalType, types),
  ))
}

export async function startChildAiVocabularyAssessment(lexicalType: "word" | "idiom") {
  const child = await requireChild()
  if (lexicalType !== "word" && lexicalType !== "idiom") throw new Error("진단 유형이 올바르지 않습니다.")
  const [settings] = await db.select().from(aiVocabularySettings)
    .where(eq(aiVocabularySettings.childProfileId, child.childProfileId)).limit(1)
  if (!settings?.enabled) throw new Error("부모님이 AI 추천 학습을 켜야 레벨 진단을 시작할 수 있어요.")

  const [existing] = await db.select().from(aiVocabularyLevelAssessments).where(and(
    eq(aiVocabularyLevelAssessments.childProfileId, child.childProfileId),
    eq(aiVocabularyLevelAssessments.lexicalType, lexicalType),
    eq(aiVocabularyLevelAssessments.status, "in_progress"),
  )).orderBy(desc(aiVocabularyLevelAssessments.startedAt)).limit(1)

  const candidates = await loadAssessmentCandidates(lexicalType)
  const usableQuestionCount = candidates.filter((candidate) => hasFourAssessmentOptions(candidate, candidates)).length
  if (usableQuestionCount < ASSESSMENT_QUESTION_COUNT) {
    throw new Error("진단 문제 데이터가 아직 충분하지 않아요. 서로 다른 뜻의 검증된 후보가 최소 9개 필요해요. 부모님이 해당 유형의 후보를 더 등록해 주세요.")
  }

  if (existing) {
    const progress = assessmentProgress(existing.assessmentData)
    if (!progress.currentQuestion) throw new Error("진행 중인 진단 정보를 찾을 수 없어요. 부모님께 다시 시작을 요청해 주세요.")
    const prompt = candidates.find((item) => item.id === progress.currentQuestion!.candidateId)
    const options = progress.currentQuestion.optionIds.map((id) => candidates.find((item) => item.id === id)).filter((item): item is AssessmentCandidate => Boolean(item))
    if (!prompt || options.length !== 4) throw new Error("진단 문제 데이터가 변경되었어요. 새 진단을 시작해 주세요.")
    return {
      assessmentId: existing.id,
      question: {
        number: progress.answers.length + 1,
        total: ASSESSMENT_QUESTION_COUNT,
        expression: prompt.expression,
        options: options.map((item) => ({ id: item.id, label: assessmentOptionLabel(item) })),
      },
    }
  }

  const first = createAssessmentQuestion(candidates, ASSESSMENT_START_LEVEL, [], 1)
  if (!first) throw new Error("진단 문제를 만들 수 없어요. 검증된 후보 데이터의 뜻과 유형을 확인해 주세요.")
  const [created] = await db.insert(aiVocabularyLevelAssessments).values({
    childProfileId: child.childProfileId,
    lexicalType,
    startingLevel: ASSESSMENT_START_LEVEL,
    assignedLevel: ASSESSMENT_START_LEVEL,
    questionCount: 0,
    correctCount: 0,
    confidence: "pending",
    status: "in_progress",
    assessmentData: {
      currentLevel: ASSESSMENT_START_LEVEL,
      consecutiveCorrect: 0,
      askedCandidateIds: [],
      answers: [],
      currentQuestion: first.state,
    },
  }).returning({ id: aiVocabularyLevelAssessments.id })
  return { assessmentId: created.id, question: first.publicQuestion }
}

export async function startChildAiVocabularyCombinedAssessment() {
  const child = await requireChild()
  const [settings] = await db.select().from(aiVocabularySettings)
    .where(eq(aiVocabularySettings.childProfileId, child.childProfileId)).limit(1)
  if (!settings?.enabled) throw new Error("부모님이 AI 추천 학습을 켜야 레벨 진단을 시작할 수 있어요.")

  const rows = await db.select().from(aiVocabularyLevelAssessments).where(and(
    eq(aiVocabularyLevelAssessments.childProfileId, child.childProfileId),
    inArray(aiVocabularyLevelAssessments.lexicalType, ["word", "idiom"]),
  )).orderBy(desc(aiVocabularyLevelAssessments.startedAt))

  const grouped = new Map<string, Map<"word" | "idiom", typeof rows[number]>>()
  for (const row of rows) {
    const data = row.assessmentData as Record<string, unknown>
    const sessionId = typeof data.combinedSessionId === "string" ? data.combinedSessionId : ""
    if (!sessionId) continue
    const type = row.lexicalType as "word" | "idiom"
    const group = grouped.get(sessionId) ?? new Map<"word" | "idiom", typeof rows[number]>()
    if (!group.has(type)) group.set(type, row)
    grouped.set(sessionId, group)
  }

  let combinedSessionId = ""
  for (const [sessionId, group] of grouped) {
    if ([...group.values()].some((row) => row.status === "in_progress")) {
      combinedSessionId = sessionId
      break
    }
  }

  if (!combinedSessionId) {
    const wordCandidates = await loadAssessmentCandidates("word")
    const idiomCandidates = await loadAssessmentCandidates("idiom")
    const wordUsable = wordCandidates.filter((candidate) => hasFourAssessmentOptions(candidate, wordCandidates)).length
    const idiomUsable = idiomCandidates.filter((candidate) => hasFourAssessmentOptions(candidate, idiomCandidates)).length
    if (wordUsable < ASSESSMENT_QUESTION_COUNT || idiomUsable < ASSESSMENT_QUESTION_COUNT) {
      const missing = [
        wordUsable < ASSESSMENT_QUESTION_COUNT ? "단어" : "",
        idiomUsable < ASSESSMENT_QUESTION_COUNT ? "숙어" : "",
      ].filter(Boolean).join("와 ")
      throw new Error(`${missing} 문제 데이터가 부족해요. 각 유형에 서로 다른 뜻의 검증된 후보가 최소 9개 필요해요.`)
    }

    combinedSessionId = randomUUID()
    const [wordStart, idiomStart] = await Promise.all([
      startChildAiVocabularyAssessment("word"),
      startChildAiVocabularyAssessment("idiom"),
    ])
    for (const [type, start] of [["word", wordStart], ["idiom", idiomStart]] as const) {
      const [row] = await db.select({ assessmentData: aiVocabularyLevelAssessments.assessmentData })
        .from(aiVocabularyLevelAssessments).where(eq(aiVocabularyLevelAssessments.id, start.assessmentId)).limit(1)
      if (!row) throw new Error("통합 진단 진행 정보를 저장하지 못했어요.")
      await db.update(aiVocabularyLevelAssessments).set({
        assessmentData: { ...(row.assessmentData as Record<string, unknown>), combinedSessionId },
      }).where(eq(aiVocabularyLevelAssessments.id, start.assessmentId))
    }
    return {
      word: { assessmentId: wordStart.assessmentId, question: wordStart.question, result: null },
      idiom: { assessmentId: idiomStart.assessmentId, question: idiomStart.question, result: null },
    }
  }

  const group = grouped.get(combinedSessionId) ?? new Map<"word" | "idiom", typeof rows[number]>()
  const restore = async (type: "word" | "idiom") => {
    const row = group.get(type)
    if (row?.status === "completed") {
      return {
        assessmentId: row.id,
        question: null,
        result: {
          level: row.assignedLevel,
          confidence: row.confidence,
          correctCount: row.correctCount,
          questionCount: row.questionCount,
        },
      }
    }
    const started = await startChildAiVocabularyAssessment(type)
    const [latest] = await db.select({ assessmentData: aiVocabularyLevelAssessments.assessmentData })
      .from(aiVocabularyLevelAssessments).where(eq(aiVocabularyLevelAssessments.id, started.assessmentId)).limit(1)
    if (latest) {
      const data = latest.assessmentData as Record<string, unknown>
      if (data.combinedSessionId !== combinedSessionId) {
        await db.update(aiVocabularyLevelAssessments).set({
          assessmentData: { ...data, combinedSessionId },
        }).where(eq(aiVocabularyLevelAssessments.id, started.assessmentId))
      }
    }
    return { assessmentId: started.assessmentId, question: started.question, result: null }
  }
  const [word, idiom] = await Promise.all([restore("word"), restore("idiom")])
  return { word, idiom }
}

export async function answerChildAiVocabularyAssessment(assessmentId: string, selectedOptionId: string) {
  const child = await requireChild()
  if (typeof assessmentId !== "string" || !assessmentId || typeof selectedOptionId !== "string" || !selectedOptionId) {
    throw new Error("답안 정보가 올바르지 않습니다.")
  }

  return db.transaction(async (tx) => {
    const [assessment] = await tx.select().from(aiVocabularyLevelAssessments).where(and(
      eq(aiVocabularyLevelAssessments.id, assessmentId),
      eq(aiVocabularyLevelAssessments.childProfileId, child.childProfileId),
      eq(aiVocabularyLevelAssessments.status, "in_progress"),
    )).for("update").limit(1)
    if (!assessment) throw new Error("진행 중인 진단을 찾을 수 없어요. 다시 시작해 주세요.")

    const progress = assessmentProgress(assessment.assessmentData)
    const question = progress.currentQuestion
    if (!question || !question.optionIds.includes(selectedOptionId)) throw new Error("선택한 답안을 확인할 수 없어요.")
    const correct = selectedOptionId === question.candidateId
    const answers = [...progress.answers, {
      candidateId: question.candidateId,
      level: question.level,
      selectedOptionId,
      correct,
    }]
    const askedCandidateIds = [...progress.askedCandidateIds, question.candidateId]
    let consecutiveCorrect = correct ? progress.consecutiveCorrect + 1 : 0
    let currentLevelNumber = assessmentLevelNumber(progress.currentLevel)
    if (!correct) currentLevelNumber = Math.max(1, currentLevelNumber - 1)
    else if (consecutiveCorrect >= 2) {
      currentLevelNumber = Math.min(6, currentLevelNumber + 1)
      consecutiveCorrect = 0
    }
    const currentLevel = "L" + currentLevelNumber
    const correctCount = answers.filter((answer) => answer.correct).length
    const candidates = await tx.select({
      id: vocabularyCandidates.id,
      expression: vocabularyCandidates.expression,
      meaningKo: vocabularyCandidates.meaningKo,
      disambiguation: vocabularyCandidates.disambiguation,
      lexicalType: vocabularyCandidates.lexicalType,
      childLevel: vocabularyCandidates.childLevel,
    }).from(vocabularyCandidates).where(and(
      eq(vocabularyCandidates.verificationStatus, "approved"),
      eq(vocabularyCandidates.difficultyVerified, true),
      isNotNull(vocabularyCandidates.meaningKo),
      isNotNull(vocabularyCandidates.childLevel),
      inArray(vocabularyCandidates.lexicalType, assessment.lexicalType === "word" ? ["word"] : ["idiom", "phrasal_verb", "collocation"]),
    ))
    const complete = answers.length >= ASSESSMENT_QUESTION_COUNT
    const next = complete ? null : createAssessmentQuestion(candidates, currentLevel, askedCandidateIds, answers.length + 1)

    if (!complete && !next) {
      const estimate = finalAssessmentLevel(answers)
      await tx.update(aiVocabularyLevelAssessments).set({
        status: "completed",
        assignedLevel: estimate.level,
        questionCount: answers.length,
        correctCount,
        confidence: "low",
        assessmentData: { ...progress, currentLevel, consecutiveCorrect, askedCandidateIds, answers, currentQuestion: null, stoppedForQuestionShortage: true },
        completedAt: new Date(),
      }).where(eq(aiVocabularyLevelAssessments.id, assessment.id))
      if (assessment.lexicalType === "word") {
        await tx.update(aiVocabularySettings).set({ wordLevel: estimate.level, updatedAt: new Date() }).where(eq(aiVocabularySettings.childProfileId, child.childProfileId))
      } else {
        await tx.update(aiVocabularySettings).set({ idiomLevel: estimate.level, updatedAt: new Date() }).where(eq(aiVocabularySettings.childProfileId, child.childProfileId))
      }
      revalidatePath("/child")
      return { complete: true as const, correct, questionNumber: answers.length, result: { level: estimate.level, confidence: "low", correctCount, questionCount: answers.length } }
    }

    if (complete) {
      const estimate = finalAssessmentLevel(answers)
      await tx.update(aiVocabularyLevelAssessments).set({
        status: "completed",
        assignedLevel: estimate.level,
        questionCount: answers.length,
        correctCount,
        confidence: estimate.confidence,
        assessmentData: { ...progress, currentLevel, consecutiveCorrect, askedCandidateIds, answers, currentQuestion: null },
        completedAt: new Date(),
      }).where(eq(aiVocabularyLevelAssessments.id, assessment.id))
      if (assessment.lexicalType === "word") {
        await tx.update(aiVocabularySettings).set({ wordLevel: estimate.level, updatedAt: new Date() }).where(eq(aiVocabularySettings.childProfileId, child.childProfileId))
      } else {
        await tx.update(aiVocabularySettings).set({ idiomLevel: estimate.level, updatedAt: new Date() }).where(eq(aiVocabularySettings.childProfileId, child.childProfileId))
      }
      revalidatePath("/child")
      return { complete: true as const, correct, questionNumber: answers.length, result: { level: estimate.level, confidence: estimate.confidence, correctCount, questionCount: answers.length } }
    }

    if (!next) throw new Error("다음 진단 문제를 준비하지 못했어요.")

    const nextProgress: AssessmentProgress = {
      combinedSessionId: progress.combinedSessionId,
      currentLevel,
      consecutiveCorrect,
      askedCandidateIds,
      answers,
      currentQuestion: next.state,
    }
    await tx.update(aiVocabularyLevelAssessments).set({
      assignedLevel: currentLevel,
      questionCount: answers.length,
      correctCount,
      assessmentData: nextProgress,
    }).where(eq(aiVocabularyLevelAssessments.id, assessment.id))
    return {
      complete: false as const,
      correct,
      questionNumber: answers.length,
      question: next.publicQuestion,
    }
  })
}

const CALENDAR_COLORS = new Set(["#2563EB", "#16A34A", "#F59E0B", "#EF4444", "#A855F7", "#EC4899", "#0D9488", "#64748B"])

export async function updateChildSubjectColor(subjectId: string, color: string) {
  const child = await requireChild()
  if (typeof subjectId !== "string" || !subjectId || !CALENDAR_COLORS.has(color)) throw new Error("과목 색상 정보가 올바르지 않습니다.")
  const [updated] = await db.update(childSubjects).set({ calendarColor: color, updatedAt: new Date() })
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, child.childProfileId), eq(childSubjects.isArchived, false)))
    .returning({ id: childSubjects.id })
  if (!updated) throw new Error("과목을 찾을 수 없습니다.")
  revalidatePath("/child")
}

export async function getChildCalendarData(month: string) {
  const child = await requireChild()
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) throw new Error("달력 월 형식이 올바르지 않습니다.")
  const start = `${month}-01`
  const end = `${month}-31`
  const rows = await db.select({
    date: wordEntries.assignmentDate,
    subjectId: wordEntries.subjectId,
    subject: wordEntries.subject,
  }).from(wordEntries).where(and(
    eq(wordEntries.userId, child.ownerUserId),
    eq(wordEntries.childProfileId, child.childProfileId),
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
  const dictionary = await lookupFreeDictionaryCached(word)
  if (dictionary.status !== "found") {
    await db.insert(childWordSubmissions).values({
      childProfileId: child.childProfileId,
      expression: word,
      normalizedExpression: normalizeDictionaryExpression(word),
      lexicalType: "word",
      meaning,
      example,
      validationStatus: dictionary.status === "not_found" ? "pending_review" : "verification_unavailable",
      dictionaryCheckedAt: dictionary.status === "not_found" ? new Date() : null,
    })
    revalidatePath("/child")
    return {
      status: "pending_review" as const,
      reason: dictionary.status === "not_found" ? "not_found" as const : dictionary.reason,
    }
  }

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
    lexicalType: "word",
  })
  revalidatePath("/child")
  return { status: "added" as const }
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

export async function clearChildWords(date: string, subjectId?: string) {
  const child = await requireChild()
  validateDate(date)
  if (subjectId !== undefined && subjectId !== "__all__") {
    await requireOwnedSubject(child.childProfileId, subjectId)
  }
  const conditions = [
    eq(wordEntries.userId, child.ownerUserId),
    eq(wordEntries.childProfileId, child.childProfileId),
    eq(wordEntries.assignmentDate, date),
  ]
  if (subjectId && subjectId !== "__all__") conditions.push(eq(wordEntries.subjectId, subjectId))
  const deleted = await db.delete(wordEntries).where(and(...conditions)).returning({ id: wordEntries.id })
  revalidatePath("/child")
  return { count: deleted.length }
}

export async function recordChildQuizResult(
  id: number,
  isCorrect: boolean,
  quizType: "standard" | "listening" = "standard",
  session: { quizSessionId: string; hintUsed: boolean; sessionQuestionCount: number },
) {
  const child = await requireChild()
  if (!Number.isInteger(id) || typeof isCorrect !== "boolean" || !["standard", "listening"].includes(quizType)) throw new Error("채점 정보가 올바르지 않습니다.")
  if (!session || typeof session.quizSessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(session.quizSessionId) ||
      typeof session.hintUsed !== "boolean" || !Number.isInteger(session.sessionQuestionCount) ||
      session.sessionQuestionCount < 1 || session.sessionQuestionCount > 500) {
    throw new Error("퀴즈 회차 정보가 올바르지 않습니다.")
  }
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
    quizSessionId: session.quizSessionId,
    hintUsed: session.hintUsed,
    quizType,
    isCorrect,
  })
  await db.update(wordEntries).set({
    wrongCount: isCorrect ? Math.max(0, word.wrongCount - 1) : word.wrongCount + 1,
  }).where(and(eq(wordEntries.id, id), eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.childProfileId)))

  const attempts = await db.select({
    isCorrect: childQuizAttempts.isCorrect,
    hintUsed: childQuizAttempts.hintUsed,
  }).from(childQuizAttempts).where(and(
    eq(childQuizAttempts.childProfileId, child.childProfileId),
    eq(childQuizAttempts.quizSessionId, session.quizSessionId),
  )).orderBy(asc(childQuizAttempts.answeredAt))

  let sessionResult: { total: number; correct: number; score: number; rewardTitle: string | null; couponConfigured: boolean; couponEligible: boolean; couponFull: boolean; storedCouponCount: number; maxStoredCoupons: number } | null = null
  if (attempts.length >= session.sessionQuestionCount) {
    const completed = attempts.slice(0, session.sessionQuestionCount)
    const correctCount = completed.filter((item) => item.isCorrect).length
    const score = Math.round(correctCount / completed.length * 100)
    sessionResult = { total: completed.length, correct: correctCount, score, rewardTitle: null, couponConfigured: false, couponEligible: false, couponFull: false, storedCouponCount: 0, maxStoredCoupons: 20 }

    const [childProfile] = await db.select({
      familyId: childProfiles.familyId,
      displayName: childProfiles.displayName,
    }).from(childProfiles).where(eq(childProfiles.id, child.childProfileId)).limit(1)
    if (childProfile) {
      const [settings] = await db.select().from(childCouponSettings).where(eq(childCouponSettings.childProfileId, child.childProfileId)).limit(1)
      const hasHint = completed.some((item) => item.hintUsed)
      if (settings?.couponsEnabled) {
        const activeCoupons = await db.select({
          id: couponTypes.id,
          title: couponTypes.title,
          couponKind: couponTypes.couponKind,
          drawWeight: couponTypes.drawWeight,
        }).from(couponTypes).where(and(
          eq(couponTypes.familyId, childProfile.familyId),
          eq(couponTypes.childProfileId, child.childProfileId),
          eq(couponTypes.isActive, true),
        ))
        sessionResult.couponConfigured = activeCoupons.length > 0
        sessionResult.maxStoredCoupons = settings.maxStoredCoupons
        if (activeCoupons.some((item) => item.drawWeight > 0) && score >= settings.rewardMinScore &&
            completed.length >= settings.rewardMinQuestions && (!settings.requireNoHint || !hasHint)) {
          const storedRows = await db.select({ id: couponRewards.id }).from(couponRewards).where(and(
            eq(couponRewards.childProfileId, child.childProfileId),
            or(eq(couponRewards.status, "earned"), eq(couponRewards.status, "blank")),
          ))
          sessionResult.storedCouponCount = storedRows.length
          sessionResult.couponFull = sessionResult.storedCouponCount >= settings.maxStoredCoupons
          sessionResult.couponEligible = !sessionResult.couponFull
        }
      }
    }
  }
  revalidatePath("/child")
  return { sessionResult }
}

export async function revealChildQuizCoupon(quizSessionId: string) {
  const child = await requireChild()
  if (typeof quizSessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(quizSessionId)) throw new Error("퀴즈 회차 정보가 올바르지 않습니다.")
  const sourceKey = "quiz:" + child.childProfileId + ":" + quizSessionId
  const [existing] = await db.select({ title: couponRewards.couponTitleSnapshot, status: couponRewards.status, description: couponTypes.description })
    .from(couponRewards).leftJoin(couponTypes, eq(couponRewards.couponTypeId, couponTypes.id)).where(eq(couponRewards.sourceKey, sourceKey)).limit(1)
  if (existing) return { outcome: existing.status === "blank" ? "blank" as const : "won" as const, title: existing.title, description: existing.description }
  const attempts = await db.select({ isCorrect: childQuizAttempts.isCorrect, hintUsed: childQuizAttempts.hintUsed }).from(childQuizAttempts).where(and(
    eq(childQuizAttempts.childProfileId, child.childProfileId), eq(childQuizAttempts.quizSessionId, quizSessionId),
  ))
  if (attempts.length === 0) throw new Error("완료된 퀴즈 기록을 찾을 수 없습니다.")
  const [childProfile] = await db.select({ familyId: childProfiles.familyId, displayName: childProfiles.displayName }).from(childProfiles).where(eq(childProfiles.id, child.childProfileId)).limit(1)
  if (!childProfile) throw new Error("자녀 프로필을 찾을 수 없습니다.")
  const activeCoupons = await db.select({ id: couponTypes.id, title: couponTypes.title, description: couponTypes.description, couponKind: couponTypes.couponKind, drawWeight: couponTypes.drawWeight })
    .from(couponTypes).where(and(eq(couponTypes.familyId, childProfile.familyId), eq(couponTypes.childProfileId, child.childProfileId), eq(couponTypes.isActive, true)))
  const weightedCoupons = activeCoupons.filter((item) => item.drawWeight > 0)
  if (weightedCoupons.length === 0) throw new Error("발행할 수 있는 활성 쿠폰이 없습니다.")
  const score = Math.round(attempts.filter((item) => item.isCorrect).length / attempts.length * 100)
  const hasHint = attempts.some((item) => item.hintUsed)
  const result = await db.transaction(async (tx) => {
    // Lock this child settings row to prevent concurrent quiz completions exceeding the wallet limit.
    const [settings] = await tx.select().from(childCouponSettings).where(eq(childCouponSettings.childProfileId, child.childProfileId)).for("update")
    if (!settings?.couponsEnabled) throw new Error("쿠폰 발행 설정을 확인할 수 없습니다.")
    if (score < settings.rewardMinScore || attempts.length < settings.rewardMinQuestions || (settings.requireNoHint && hasHint)) throw new Error("쿠폰 발행 조건을 충족하지 못했습니다.")
    const [saved] = await tx.select({ title: couponRewards.couponTitleSnapshot, status: couponRewards.status, description: couponTypes.description })
      .from(couponRewards).leftJoin(couponTypes, eq(couponRewards.couponTypeId, couponTypes.id)).where(eq(couponRewards.sourceKey, sourceKey)).limit(1)
    if (saved) return { created: false, value: { outcome: saved.status === "blank" ? "blank" as const : "won" as const, title: saved.title, description: saved.description } }
    const storedRows = await tx.select({ id: couponRewards.id }).from(couponRewards).where(and(
      eq(couponRewards.childProfileId, child.childProfileId), or(eq(couponRewards.status, "earned"), eq(couponRewards.status, "blank")),
    ))
    if (storedRows.length >= settings.maxStoredCoupons) return { created: false, value: { outcome: "full" as const, title: null, description: null } }
    const preferredKind = randomInt(100) < settings.blankCouponProbability ? "blank" : "regular"
    const preferredCandidates = weightedCoupons.filter((item) => item.couponKind === preferredKind)
    const candidates = preferredCandidates.length ? preferredCandidates : weightedCoupons.filter((item) => item.couponKind !== preferredKind)
    const totalWeight = candidates.reduce((sum, item) => sum + item.drawWeight, 0)
    if (totalWeight <= 0) throw new Error("가중치가 설정된 활성 쿠폰이 없습니다.")
    let ticket = randomInt(totalWeight)
    const chosen = candidates.find((item) => { ticket -= item.drawWeight; return ticket < 0 }) ?? candidates[candidates.length - 1]
    const isBlank = chosen.couponKind === "blank"
    const [reward] = await tx.insert(couponRewards).values({ childProfileId: child.childProfileId, couponTypeId: chosen.id, couponTitleSnapshot: chosen.title, status: isBlank ? "blank" : "earned", sourceKey }).onConflictDoNothing().returning({ id: couponRewards.id })
    if (!reward) {
      const [duplicate] = await tx.select({ title: couponRewards.couponTitleSnapshot, status: couponRewards.status, description: couponTypes.description }).from(couponRewards)
        .leftJoin(couponTypes, eq(couponRewards.couponTypeId, couponTypes.id)).where(eq(couponRewards.sourceKey, sourceKey)).limit(1)
      return { created: false, value: { outcome: duplicate?.status === "blank" ? "blank" as const : "won" as const, title: duplicate?.title ?? chosen.title, description: duplicate?.description ?? chosen.description } }
    }
    return { created: true, value: { outcome: isBlank ? "blank" as const : "won" as const, title: chosen.title, description: chosen.description }, chosenTitle: chosen.title, isBlank }
  })
  if (result.created) {
    try {
      await db.execute(sql`INSERT INTO coupon_activity_events
        (family_id, child_profile_id, child_name, coupon_title, event_type, occurred_at)
        VALUES (${childProfile.familyId}::uuid, ${child.childProfileId}::uuid, ${childProfile.displayName}, ${result.chosenTitle}, 'issued', now())`)
    } catch (error) {
      console.error("Coupon issuance history could not be recorded:", error)
    }
    await notifyFamilyParents({ familyId: childProfile.familyId, childProfileId: child.childProfileId, type: "coupon_issued",
      title: result.isBlank ? "꽝 쿠폰이 발행됐어요" : "새 쿠폰이 발행됐어요",
      message: child.childName + "에게 " + result.chosenTitle + " " + (result.isBlank ? "꽝 쿠폰" : "쿠폰") + "이 발행됐어요.", href: "/parent#coupon-rewards" })
    revalidatePath("/child"); revalidatePath("/parent")
  }
  return result.value
}
export async function gradeChildListeningAnswer(id: number, submittedWord: string, submittedMeaning: string) {
  const child = await requireChild()
  if (!Number.isInteger(id) || typeof submittedWord !== "string" || typeof submittedMeaning !== "string") {
    throw new Error("답안 형식이 올바르지 않습니다.")
  }
  const wordGuess = submittedWord.trim().replace(/['‘’`]/g, "'").toLocaleLowerCase()
  const meaningGuess = submittedMeaning.trim()
  if (!wordGuess || !meaningGuess || wordGuess.length > 100 || meaningGuess.length > 200) {
    throw new Error("영어 단어와 한국어 뜻을 모두 입력해 주세요.")
  }
  const [word] = await db.select().from(wordEntries)
    .where(and(eq(wordEntries.id, id), eq(wordEntries.userId, child.ownerUserId), eq(wordEntries.childProfileId, child.childProfileId)))
    .limit(1)
  if (!word) throw new Error("학습 단어를 찾을 수 없습니다.")

  const wordCorrect = wordGuess === word.word.trim().replace(/['‘’`]/g, "'").toLocaleLowerCase()
  const allowed = await consumeUserRateLimit(child.ownerUserId, "ai-meaning-grading", 60, 3600)
  if (!allowed) throw new Error("AI 뜻 채점은 1시간에 60회까지 가능합니다.")

  let meaningCorrect = false
  let feedback = "AI 채점 결과를 확인하지 못했습니다."
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`
    const prompt = `
당신은 깐깐하지만 다정한 중학교 영어 선생님입니다.
단어의 원래 뜻은 ${JSON.stringify(word.meaning)} 이고, 학생이 적은 뜻은 ${JSON.stringify(meaningGuess)} 입니다.

[채점 기준]
1. 품사(명사, 동사, 형용사, 부사 등)가 다르면 무조건 틀린 것(false)으로 처리하세요. 예를 들어 원래 뜻이 '~하다(동사)'인데 '~하게(부사)'로 적었으면 오답입니다.
2. 띄어쓰기 오류나 완전히 뜻이 같은 유의어는 정답(true)으로 인정합니다. 단, 품사는 반드시 같아야 합니다.
3. 등록된 뜻이 여러 개라면 학생이 그중 하나만 정확히 적어도 품사가 맞을 경우 정답으로 인정합니다.
4. 의미가 비슷해 보여도 핵심 의미나 품사가 다르면 오답으로 처리합니다.

JSON만 반환하세요:
{"isCorrect":true,"feedback":"정답 여부와 이유를 설명하는 짧고 다정한 한국어 피드백"}
`.trim()
    let response: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
      })
      if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) break
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
    }
    if (!response?.ok) throw new Error("AI 채점 API 요청에 실패했습니다.")
    const payload = await response.json()
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof raw !== "string") throw new Error("AI 채점 결과가 비어 있습니다.")
    const parsed = JSON.parse(raw.replace(/```json/g, "").replace(/```/g, "").trim()) as { isCorrect?: unknown; feedback?: unknown }
    meaningCorrect = parsed.isCorrect === true
    feedback = typeof parsed.feedback === "string" ? parsed.feedback.slice(0, 500) : (meaningCorrect ? "뜻을 정확하게 이해했어요!" : "뜻이나 품사를 다시 확인해 보세요.")
  } catch (error) {
    console.error("AI 뜻 채점 오류:", error)
    meaningCorrect = word.meaning.replace(/\s/g, "").includes(meaningGuess.replace(/\s/g, ""))
    feedback = "AI 채점 서버에 연결하지 못해 등록된 뜻과 비교해 자동 채점했습니다."
  }
  return { isCorrect: wordCorrect && meaningCorrect, wordCorrect, meaningCorrect, feedback }
}

export async function getChildAzureSpeechToken(): Promise<{ success: true; token: string; region: string } | { success: false; error: string }> {
  const child = await requireChild()
  const allowed = await consumeUserRateLimit(child.ownerUserId, "azure-speech-token", 60, 3600)
  if (!allowed) return { success: false, error: "음성 재생 요청은 1시간에 60회까지 가능합니다." }

  try {
    const key = process.env.AZURE_SPEECH_KEY
    const region = process.env.AZURE_SPEECH_REGION
    if (!key || !region) return { success: false, error: "Azure 음성 설정이 없습니다." }

    const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store",
    })
    if (!response.ok) return { success: false, error: "음성 토큰 발급에 실패했습니다." }
    return { success: true, token: await response.text(), region }
  } catch (error) {
    console.error("자녀 Azure 음성 토큰 오류:", error)
    return { success: false, error: "음성 서버에 연결하지 못했습니다." }
  }
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
    return { word, meaning, example, normalizedExpression: normalizeDictionaryExpression(word) }
  })

  const lookups = await Promise.all(rows.map((item) => lookupFreeDictionaryCached(item.word)))
  const accepted: typeof rows = []
  const pending: typeof rows = []
  const pendingStatuses: ("pending_review" | "verification_unavailable")[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const lookup = lookups[index]
    if (lookup.status === "found") {
      accepted.push(rows[index])
    } else {
      pending.push(rows[index])
      pendingStatuses.push(lookup.status === "not_found" ? "pending_review" : "verification_unavailable")
    }
  }

  if (accepted.length) {
    await db.insert(wordEntries).values(accepted.map((item) => ({
      userId: child.ownerUserId,
      childProfileId: child.childProfileId,
      profile: child.childName,
      assignmentDate: input.date,
      subjectId: subject.id,
      subject: subject.name,
      word: item.word,
      meaning: item.meaning,
      example: item.example,
      lexicalType: "word",
    })))
  }
  if (pending.length) {
    await db.insert(childWordSubmissions).values(pending.map((item, index) => ({
      childProfileId: child.childProfileId,
      expression: item.word,
      normalizedExpression: item.normalizedExpression,
      lexicalType: "word",
      meaning: item.meaning,
      example: item.example,
      validationStatus: pendingStatuses[index],
      dictionaryCheckedAt: pendingStatuses[index] === "pending_review" ? new Date() : null,
    })))
  }
  revalidatePath("/child")
  return { count: accepted.length, pendingCount: pending.length }
}


/**
 * word-test 호환 AI 문장 퀴즈 어댑터.
 * 기존 퀴즈 UI가 기대하는 응답 형태를 유지하되, 자녀 기기 세션과
 * 가족 계정의 사용자별 사용량 제한을 적용한다.
 */
export async function generateChildContextQuiz(
  words: { word: string; meaning: string }[],
  quizType: "context" | "speaking",
) {
  const child = await requireChild()
  if (!Array.isArray(words) || words.length < 1 || words.length > 10 ||
      !["context", "speaking"].includes(quizType) ||
      words.some((item) => !item || typeof item.word !== "string" || typeof item.meaning !== "string" || !item.word.trim() || !item.meaning.trim())) {
    throw new Error("AI 문장 퀴즈 입력값이 올바르지 않습니다.")
  }
  const allowed = await consumeUserRateLimit(child.ownerUserId, "ai-context-quiz", 20, 3600)
  if (!allowed) return { success: false as const, isRateLimit: true, error: "AI 문장 퀴즈는 1시간에 20회까지 가능합니다." }

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return { success: false as const, error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }

  const count = quizType === "speaking" ? Math.min(5, words.length) : Math.min(10, words.length)
  const prompt = `
당신은 초등학생 영어 선생님입니다. 아래 단어를 사용해 영어 빈칸 문장 문제를 정확히 ${count}개 만드세요.
학습자 이름: ${child.childName}
유형: ${quizType === "speaking" ? "소리 내어 문장 말하기 연습" : "문맥 속 단어 선택 퀴즈"}
단어 목록: ${JSON.stringify(words)}
규칙:
- 각 단어는 입력 목록에서 하나씩 선택하고 word 필드에 원문 그대로 씁니다.
- sentence는 해당 단어 자리를 ___ 로 표시한 자연스러운 영어 문장입니다.
- translation은 문장 전체의 자연스러운 한국어 번역입니다.
- clue는 짧은 한국어 힌트, guide는 말하기 연습 안내입니다.
- JSON 외의 설명은 출력하지 않습니다.
반환 형식: {"quizData":[{"word":"...","sentence":"... ___ ...","translation":"...","clue":"...","guide":"..."}]}
`.trim()
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, responseMimeType: "application/json" },
      }),
    })
    if (!response.ok) return { success: false as const, error: "AI 문장 문제 생성에 실패했습니다." }
    const payload = await response.json()
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof raw !== "string") return { success: false as const, error: "AI 문장 문제 결과가 비어 있습니다." }
    const parsed = JSON.parse(raw.replace(/```json/g, "").replace(/```/g, "").trim()) as { quizData?: unknown }
    if (!Array.isArray(parsed.quizData)) return { success: false as const, error: "AI 문장 문제 형식이 올바르지 않습니다." }
    const allowedWords = new Set(words.map((item) => item.word.toLocaleLowerCase()))
    const quizData = parsed.quizData.filter((item): item is { word: string; sentence: string; translation: string; clue?: string; guide?: string } =>
      !!item && typeof item === "object" &&
      typeof (item as any).word === "string" && allowedWords.has((item as any).word.toLocaleLowerCase()) &&
      typeof (item as any).sentence === "string" && (item as any).sentence.includes("___") &&
      typeof (item as any).translation === "string",
    ).slice(0, count)
    if (!quizData.length) return { success: false as const, error: "사용할 수 있는 문장 문제가 생성되지 않았습니다." }
    return { success: true as const, quizData }
  } catch (error) {
    console.error("자녀 AI 문장 퀴즈 생성 오류:", error)
    return { success: false as const, error: "AI 문장 문제 생성 중 오류가 발생했습니다." }
  }
}

/** word-test의 말하기 코칭 응답 형식을 자녀 인증으로 제공한다. */
export async function generateChildSpeakingCoachFeedback(input: {
  sentence: string
  pronResult: { score: number; accuracy: number; fluency: number; completeness: number; prosody: number }
  wordScores: { text: string; score: number; errorType?: string }[]
}) {
  const child = await requireChild()
  if (!input || typeof input.sentence !== "string" || input.sentence.length > 1000 ||
      !input.pronResult || !Array.isArray(input.wordScores) || input.wordScores.length > 80) {
    throw new Error("말하기 코칭 입력값이 올바르지 않습니다.")
  }
  const allowed = await consumeUserRateLimit(child.ownerUserId, "ai-speaking-coach", 30, 3600)
  if (!allowed) return { success: false as const, error: "AI 말하기 코칭은 1시간에 30회까지 가능합니다." }
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return { success: false as const, error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }

  const prompt = `
당신은 초등학생 ${child.childName}의 다정한 영어 발음 코치입니다.
연습 문장: ${JSON.stringify(input.sentence)}
발음 평가 점수: ${JSON.stringify(input.pronResult)}
단어별 평가: ${JSON.stringify(input.wordScores)}
한국어로 2~4문장 피드백을 작성하세요. 잘한 점을 먼저 말하고 가장 개선 효과가 큰 발음 한두 가지만 구체적으로 알려주세요. 점수만 반복하지 말고 격려하는 말투를 사용하세요.
`.trim()
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }),
    })
    if (!response.ok) return { success: false as const, error: "AI 말하기 코칭 요청에 실패했습니다." }
    const payload = await response.json()
    const feedback = payload.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof feedback !== "string" || !feedback.trim()) return { success: false as const, error: "AI 코칭 결과가 비어 있습니다." }
    return { success: true as const, feedback: feedback.trim().slice(0, 1200) }
  } catch (error) {
    console.error("자녀 AI 말하기 코칭 오류:", error)
    return { success: false as const, error: "AI 말하기 코칭 중 오류가 발생했습니다." }
  }
}


function todayInSeoulForArcade() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

async function getPacmanEligibility(childProfileId: string) {
  const [profile] = await db.select({ familyId: childProfiles.familyId })
    .from(childProfiles).where(eq(childProfiles.id, childProfileId)).limit(1)
  if (!profile) throw new Error("아이 프로필을 찾을 수 없습니다.")
  const [settings] = await db.select({
    pacmanEnabled: familyArcadeSettings.pacmanEnabled,
    pacmanDailyPlayLimit: familyArcadeSettings.pacmanDailyPlayLimit,
    pacmanMinDailyQuestions: familyArcadeSettings.pacmanMinDailyQuestions,
    pacmanRequireNoWrongWords: familyArcadeSettings.pacmanRequireNoWrongWords,
  }).from(familyArcadeSettings).where(eq(familyArcadeSettings.familyId, profile.familyId)).limit(1)
  const today = todayInSeoulForArcade()
  const dayStart = new Date(`${today}T00:00:00+09:00`)
  const [questionCount] = await db.select({ total: sql<number>`count(*)::int` })
    .from(childQuizAttempts)
    .where(and(eq(childQuizAttempts.childProfileId, childProfileId), gte(childQuizAttempts.answeredAt, dayStart)))
  const [wrongCount] = await db.select({ total: sql<number>`count(*)::int` })
    .from(wordEntries)
    .where(and(eq(wordEntries.childProfileId, childProfileId), gt(wordEntries.wrongCount, 0)))
  const dailyQuestionCount = Number(questionCount?.total ?? 0)
  const outstandingWrongCount = Number(wrongCount?.total ?? 0)
  const minDailyQuestions = settings?.pacmanMinDailyQuestions ?? 10
  const requireNoWrongWords = settings?.pacmanRequireNoWrongWords ?? true
  const questionsMet = dailyQuestionCount >= minDailyQuestions
  const wrongWordsCleared = outstandingWrongCount === 0
  return {
    settings, today, dailyQuestionCount, outstandingWrongCount, minDailyQuestions,
    requireNoWrongWords, questionsMet, wrongWordsCleared,
    eligible: questionsMet && (!requireNoWrongWords || wrongWordsCleared),
  }
}

export async function getChildPacmanStatus() {
  const child = await requireChild()
  const eligibility = await getPacmanEligibility(child.childProfileId)
  const dailyPlayLimit = eligibility.settings?.pacmanDailyPlayLimit ?? 1
  const [usage] = await db.select({ playsUsed: childPacmanDailyPlays.playsUsed })
    .from(childPacmanDailyPlays)
    .where(and(eq(childPacmanDailyPlays.childProfileId, child.childProfileId), eq(childPacmanDailyPlays.playDate, eligibility.today)))
    .limit(1)
  const playsUsed = usage?.playsUsed ?? 0
  const [profile] = await db.select({ showPacman: childProfiles.showPacman, showWordDefense: childProfiles.showWordDefense }).from(childProfiles).where(eq(childProfiles.id, child.childProfileId)).limit(1)
  const gamesEnabled = eligibility.settings?.pacmanEnabled ?? false
  return {
    showPacman: gamesEnabled && (profile?.showPacman ?? true), showWordDefense: gamesEnabled && (profile?.showWordDefense ?? true),
    enabled: gamesEnabled,
    dailyPlayLimit, unlimitedPlays: dailyPlayLimit === 0, playsUsed,
    remainingPlays: dailyPlayLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, dailyPlayLimit - playsUsed),
    dailyQuestionCount: eligibility.dailyQuestionCount,
    minDailyQuestions: eligibility.minDailyQuestions,
    outstandingWrongCount: eligibility.outstandingWrongCount,
    requireNoWrongWords: eligibility.requireNoWrongWords,
    eligible: eligibility.eligible,
  }
}

export async function startChildPacmanGame(game: "pacman" | "word_defense" = "pacman") {
  const child = await requireChild()
  if (game !== "pacman" && game !== "word_defense") throw new Error("게임 종류가 올바르지 않습니다.")
  const [profile] = await db.select({ showPacman: childProfiles.showPacman, showWordDefense: childProfiles.showWordDefense }).from(childProfiles).where(eq(childProfiles.id, child.childProfileId)).limit(1)
  const eligibility = await getPacmanEligibility(child.childProfileId)
  if (!eligibility.settings?.pacmanEnabled) throw new Error("부모님이 게임 이용을 허용하지 않았어요.")
  if (game === "pacman" && !profile?.showPacman) throw new Error(`부모님이 ${OWL_GAME_NAME} 게임을 숨겼어요.`)
  if (game === "word_defense" && !profile?.showWordDefense) throw new Error("부모님이 영어 타자 디펜스 게임을 숨겼어요.")
  if (!eligibility.eligible) {
    if (!eligibility.questionsMet) throw new Error(`오늘 단어 문제를 ${eligibility.minDailyQuestions}개 이상 풀어야 ${OWL_GAME_NAME}을 할 수 있어요. 현재 ${eligibility.dailyQuestionCount}개를 풀었어요.`)
    throw new Error(`이전부터 남아 있는 오답까지 모두 해결한 뒤 ${OWL_GAME_NAME}을 할 수 있어요.`)
  }
  const dailyPlayLimit = eligibility.settings.pacmanDailyPlayLimit
  const result = await db.execute(sql`
    INSERT INTO child_pacman_daily_plays (child_profile_id, play_date, plays_used)
    VALUES (${child.childProfileId}::uuid, ${eligibility.today}, 1)
    ON CONFLICT (child_profile_id, play_date)
    DO UPDATE SET plays_used = child_pacman_daily_plays.plays_used + 1, updated_at = now()
    WHERE ${dailyPlayLimit === 0} OR child_pacman_daily_plays.plays_used < ${dailyPlayLimit}
    RETURNING plays_used
  `)
  const row = result.rows[0] as { plays_used: number } | undefined
  if (!row) throw new Error(`오늘 사용할 수 있는 ${OWL_GAME_NAME} 게임 횟수를 모두 사용했어요. 내일 다시 도전해요!`)
  await db.insert(childGamePlays).values({ childProfileId: child.childProfileId, game })
  revalidatePath("/child")
  return {
    playsUsed: Number(row.plays_used),
    remainingPlays: dailyPlayLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, dailyPlayLimit - Number(row.plays_used)),
    dailyPlayLimit,
    unlimitedPlays: dailyPlayLimit === 0,
  }
}


/** Toggle a private bookmark without changing the wordbook or learning history. */
export async function toggleChildWordFavorite(wordEntryId: number) {
  const child = await requireChild()
  if (!Number.isInteger(wordEntryId) || wordEntryId < 1) throw new Error("단어 정보가 올바르지 않습니다.")

  const [word] = await db.select({ id: wordEntries.id }).from(wordEntries)
    .where(and(
      eq(wordEntries.id, wordEntryId),
      eq(wordEntries.userId, child.ownerUserId),
      eq(wordEntries.childProfileId, child.childProfileId),
    ))
    .limit(1)
  if (!word) throw new Error("이 자녀의 단어장에서 해당 표현을 찾을 수 없습니다.")

  const [favorite] = await db.select({ id: childWordFavorites.id }).from(childWordFavorites)
    .where(and(
      eq(childWordFavorites.childProfileId, child.childProfileId),
      eq(childWordFavorites.wordEntryId, wordEntryId),
    ))
    .limit(1)

  if (favorite) {
    await db.delete(childWordFavorites).where(and(
      eq(childWordFavorites.id, favorite.id),
      eq(childWordFavorites.childProfileId, child.childProfileId),
    ))
    revalidatePath("/child")
    return { isFavorite: false }
  }

  await db.insert(childWordFavorites).values({
    childProfileId: child.childProfileId,
    wordEntryId,
  }).onConflictDoNothing()
  revalidatePath("/child")
  return { isFavorite: true }
}


function todayInSeoulForAiVocabulary(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export async function recordChildAiVocabularyCardView(
  bundleId: string,
  itemId: string,
  side: "front" | "back",
) {
  const child = await requireChild()
  if (!/^[0-9a-f-]{36}$/i.test(bundleId) || !/^[0-9a-f-]{36}$/i.test(itemId) ||
      !["front", "back"].includes(side)) {
    throw new Error("카드 학습 정보가 올바르지 않습니다.")
  }
  const [bundle] = await db.select().from(aiVocabularyBundles).where(and(
    eq(aiVocabularyBundles.id, bundleId),
    eq(aiVocabularyBundles.childProfileId, child.childProfileId),
    eq(aiVocabularyBundles.studyDate, todayInSeoulForAiVocabulary()),
    inArray(aiVocabularyBundles.status, ["published", "cards_completed", "quiz_in_progress"]),
  )).limit(1)
  if (!bundle) throw new Error("오늘 학습할 AI 추천 묶음을 찾을 수 없습니다.")

  const update = side === "front"
    ? { frontViewedAt: new Date() }
    : { backViewedAt: new Date() }
  const [item] = await db.update(aiVocabularyBundleItems).set(update).where(and(
    eq(aiVocabularyBundleItems.id, itemId),
    eq(aiVocabularyBundleItems.bundleId, bundle.id),
  )).returning({ id: aiVocabularyBundleItems.id })
  if (!item) throw new Error("오늘의 추천 카드를 찾을 수 없습니다.")

  const items = await db.select({
    frontViewedAt: aiVocabularyBundleItems.frontViewedAt,
    backViewedAt: aiVocabularyBundleItems.backViewedAt,
  }).from(aiVocabularyBundleItems).where(eq(aiVocabularyBundleItems.bundleId, bundle.id))
  const cardsCompleted = items.length > 0 && items.every((item) => item.frontViewedAt && item.backViewedAt)
  if (cardsCompleted && bundle.status === "published") {
    await db.update(aiVocabularyBundles).set({ status: "cards_completed", updatedAt: new Date() })
      .where(and(eq(aiVocabularyBundles.id, bundle.id), eq(aiVocabularyBundles.status, "published")))
  }
  revalidatePath("/child")
  return { cardsCompleted }
}

export async function startChildAiVocabularyQuiz(bundleId: string) {
  const child = await requireChild()
  if (!/^[0-9a-f-]{36}$/i.test(bundleId)) throw new Error("오늘의 추천 묶음 정보가 올바르지 않습니다.")
  const [bundle] = await db.select().from(aiVocabularyBundles).where(and(
    eq(aiVocabularyBundles.id, bundleId),
    eq(aiVocabularyBundles.childProfileId, child.childProfileId),
    eq(aiVocabularyBundles.studyDate, todayInSeoulForAiVocabulary()),
    inArray(aiVocabularyBundles.status, ["cards_completed", "quiz_in_progress"]),
  )).limit(1)
  if (!bundle) throw new Error("모든 오늘의 단어 카드를 확인한 다음 퀴즈를 시작해 주세요.")

  const items = await db.select().from(aiVocabularyBundleItems)
    .where(eq(aiVocabularyBundleItems.bundleId, bundle.id))
  if (!items.length || items.some((item) => !item.frontViewedAt || !item.backViewedAt || !item.wordEntryId)) {
    throw new Error("아직 확인하지 않은 카드가 있어요. 모든 카드의 앞면과 뒷면을 확인해 주세요.")
  }

  const wordIds = items.map((item) => item.wordEntryId!)
  // The bundle ID is the stable quiz session ID. Re-entry after a refresh
  // continues the same session and skips expressions already submitted.
  const previousAttempts = await db.select({ wordEntryId: childQuizAttempts.wordEntryId })
    .from(childQuizAttempts).where(and(
      eq(childQuizAttempts.childProfileId, child.childProfileId),
      eq(childQuizAttempts.quizSessionId, bundle.id),
      inArray(childQuizAttempts.wordEntryId, wordIds),
    ))
  const answeredWordIds = [...new Set(previousAttempts.map((attempt) => attempt.wordEntryId))]
  if (answeredWordIds.length === wordIds.length) {
    await db.update(aiVocabularyBundles).set({
      status: "completed",
      completedAt: bundle.completedAt ?? new Date(),
      updatedAt: new Date(),
    }).where(eq(aiVocabularyBundles.id, bundle.id))
    revalidatePath("/child")
    return {
      success: true,
      completed: true,
      quizSessionId: bundle.id,
      wordIds,
      answeredWordIds,
    }
  }

  if (bundle.status === "cards_completed") {
    await db.update(aiVocabularyBundles).set({ status: "quiz_in_progress", updatedAt: new Date() })
      .where(eq(aiVocabularyBundles.id, bundle.id))
  }
  return {
    success: true,
    completed: false,
    quizSessionId: bundle.id,
    wordIds,
    answeredWordIds,
  }
}

export async function completeChildAiVocabularyQuiz(bundleId: string, quizSessionId: string) {
  const child = await requireChild()
  if (!/^[0-9a-f-]{36}$/i.test(bundleId) || !/^[0-9a-f-]{36}$/i.test(quizSessionId)) {
    throw new Error("오늘의 확인 퀴즈 정보가 올바르지 않습니다.")
  }

  return db.transaction(async (tx) => {
    const [bundle] = await tx.select().from(aiVocabularyBundles).where(and(
      eq(aiVocabularyBundles.id, bundleId),
      eq(aiVocabularyBundles.childProfileId, child.childProfileId),
      eq(aiVocabularyBundles.studyDate, todayInSeoulForAiVocabulary()),
      eq(aiVocabularyBundles.status, "quiz_in_progress"),
    )).for("update").limit(1)
    if (!bundle) throw new Error("진행 중인 오늘의 확인 퀴즈를 찾을 수 없습니다.")

    const items = await tx.select({ wordEntryId: aiVocabularyBundleItems.wordEntryId })
      .from(aiVocabularyBundleItems).where(eq(aiVocabularyBundleItems.bundleId, bundle.id))
    const wordIds = items.map((item) => item.wordEntryId).filter((id): id is number => id !== null)
    if (!wordIds.length || wordIds.length !== items.length) throw new Error("확인 퀴즈에 필요한 추천 단어가 완전하지 않습니다.")

    const attempts = await tx.select({ wordEntryId: childQuizAttempts.wordEntryId })
      .from(childQuizAttempts).where(and(
        eq(childQuizAttempts.childProfileId, child.childProfileId),
        eq(childQuizAttempts.quizSessionId, quizSessionId),
        inArray(childQuizAttempts.wordEntryId, wordIds),
      ))
    const completedIds = new Set(attempts.map((attempt) => attempt.wordEntryId))
    if (completedIds.size !== wordIds.length || wordIds.some((id) => !completedIds.has(id))) {
      throw new Error("오늘의 추천 표현을 모두 퀴즈로 확인하지 않았습니다.")
    }

    await tx.update(aiVocabularyBundles).set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(aiVocabularyBundles.id, bundle.id))
    revalidatePath("/child")
    return { completed: true }
  })
}
