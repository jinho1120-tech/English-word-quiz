"use server"

import { randomInt } from "node:crypto"
import { and, asc, desc, eq, gt, gte, lte, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { childPacmanDailyPlays, childProfiles, childQuizAttempts, childSubjects, couponRewards, couponTypes, childCouponSettings, familyArcadeSettings, wordEntries } from "@/lib/db/schema"
import { consumeUserRateLimit } from "@/lib/rate-limit"
import { extractWordsFromImage } from "@/lib/ai-word-scan"
import { getChildDeviceSession } from "@/lib/child-auth"
import { notifyFamilyParents } from "@/lib/notifications"

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
    return { userId: child.ownerUserId, childProfileId: child.childProfileId, profile: child.childName, assignmentDate: input.date, subjectId: subject.id, subject: subject.name, word, meaning, example }
  })
  await db.insert(wordEntries).values(rows)
  revalidatePath("/child")
  return { count: rows.length }
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
  return {
    enabled: eligibility.settings?.pacmanEnabled ?? false,
    dailyPlayLimit, playsUsed,
    remainingPlays: Math.max(0, dailyPlayLimit - playsUsed),
    dailyQuestionCount: eligibility.dailyQuestionCount,
    minDailyQuestions: eligibility.minDailyQuestions,
    outstandingWrongCount: eligibility.outstandingWrongCount,
    requireNoWrongWords: eligibility.requireNoWrongWords,
    eligible: eligibility.eligible,
  }
}

export async function startChildPacmanGame() {
  const child = await requireChild()
  const eligibility = await getPacmanEligibility(child.childProfileId)
  if (!eligibility.settings?.pacmanEnabled) throw new Error("부모님이 아직 팩맨 게임을 허용하지 않았어요.")
  if (!eligibility.eligible) {
    if (!eligibility.questionsMet) throw new Error(`오늘 단어 문제를 ${eligibility.minDailyQuestions}개 이상 풀어야 팩맨을 할 수 있어요. 현재 ${eligibility.dailyQuestionCount}개를 풀었어요.`)
    throw new Error("이전부터 남아 있는 오답까지 모두 해결한 뒤 팩맨을 할 수 있어요.")
  }
  const dailyPlayLimit = eligibility.settings.pacmanDailyPlayLimit
  const result = await db.execute(sql`
    INSERT INTO child_pacman_daily_plays (child_profile_id, play_date, plays_used)
    VALUES (${child.childProfileId}::uuid, ${eligibility.today}, 1)
    ON CONFLICT (child_profile_id, play_date)
    DO UPDATE SET plays_used = child_pacman_daily_plays.plays_used + 1, updated_at = now()
    WHERE child_pacman_daily_plays.plays_used < ${dailyPlayLimit}
    RETURNING plays_used
  `)
  const row = result.rows[0] as { plays_used: number } | undefined
  if (!row) throw new Error("오늘 사용할 수 있는 팩맨 게임 횟수를 모두 사용했어요. 내일 다시 도전해요!")
  revalidatePath("/child")
  return { playsUsed: Number(row.plays_used), remainingPlays: Math.max(0, dailyPlayLimit - Number(row.plays_used)), dailyPlayLimit }
}
