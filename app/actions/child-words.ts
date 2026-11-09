"use server"

import { randomInt } from "node:crypto"
import { and, asc, desc, eq, gt, gte } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { childProfiles, childQuizAttempts, childSubjects, couponRewards, couponTypes, familySettings, wordEntries } from "@/lib/db/schema"
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

  let sessionResult: { total: number; correct: number; score: number; rewardTitle: string | null } | null = null
  if (attempts.length >= session.sessionQuestionCount) {
    const completed = attempts.slice(0, session.sessionQuestionCount)
    const correctCount = completed.filter((item) => item.isCorrect).length
    const score = Math.round(correctCount / completed.length * 100)
    sessionResult = { total: completed.length, correct: correctCount, score, rewardTitle: null }

    const [childProfile] = await db.select({
      familyId: childProfiles.familyId,
      displayName: childProfiles.displayName,
    }).from(childProfiles).where(eq(childProfiles.id, child.childProfileId)).limit(1)
    if (childProfile) {
      const [settings] = await db.select().from(familySettings).where(eq(familySettings.familyId, childProfile.familyId)).limit(1)
      const hasHint = completed.some((item) => item.hintUsed)
      if (settings?.couponsEnabled && score >= settings.rewardMinScore &&
          completed.length >= settings.rewardMinQuestions && (!settings.requireNoHint || !hasHint)) {
        const activeCoupons = await db.select({
          id: couponTypes.id,
          title: couponTypes.title,
        }).from(couponTypes).where(and(
          eq(couponTypes.familyId, childProfile.familyId),
          eq(couponTypes.isActive, true),
        ))
        if (activeCoupons.length > 0) {
          const chosen = activeCoupons[randomInt(activeCoupons.length)]
          const sourceKey = `quiz:${child.childProfileId}:${session.quizSessionId}`
          const [reward] = await db.insert(couponRewards).values({
            childProfileId: child.childProfileId,
            couponTypeId: chosen.id,
            couponTitleSnapshot: chosen.title,
            sourceKey,
          }).onConflictDoNothing().returning({ id: couponRewards.id })
          if (reward) {
            sessionResult.rewardTitle = chosen.title
          }
        }
      }
    }
  }
  revalidatePath("/child")
  return { sessionResult }
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
