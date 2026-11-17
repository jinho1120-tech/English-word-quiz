"use server"

import { createHash } from "node:crypto"
import { inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/super-admin"
import { vocabularyCandidates } from "@/lib/db/schema"
import { normalizeDictionaryExpression } from "@/lib/free-dictionary-api"

const LEXICAL_TYPES = new Set(["word", "idiom", "phrasal_verb", "collocation"])
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
const MAX_ROWS_PER_BATCH = 100
const MAX_SOURCE_PAYLOAD_LENGTH = 3500

export type VocabularyDatasetImportRow = {
  expression: string
  definitionEn: string
  partOfSpeech?: string
  exampleSentence?: string
  lexicalType?: string
  cefrLevel?: string
  frequencyRank?: number | string | null
  sourceEntryUrl?: string
  sourceRecordId?: string
  sourcePayload?: Record<string, unknown>
}

export type VocabularyDatasetImportMetadata = {
  sourceName: string
  sourceDatasetUrl: string
  licenseName: string
  licenseUrl?: string
}

function requireHttpsUrl(value: string, label: string, optional = false): string | null {
  const trimmed = value.trim()
  if (!trimmed && optional) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:") throw new Error()
    return url.toString()
  } catch {
    throw new Error(label + "에는 https://로 시작하는 유효한 주소를 입력해 주세요.")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function safeSourcePayload(value: unknown, metadata: VocabularyDatasetImportMetadata, sourceRecordId: string | null) {
  let serialized = "{}"
  if (isRecord(value)) {
    try {
      serialized = JSON.stringify(value)
    } catch {
      serialized = "{}"
    }
  }
  return {
    importKind: "public_dataset",
    datasetName: metadata.sourceName,
    datasetUrl: metadata.sourceDatasetUrl,
    sourceRecordId,
    originalRecordExcerpt: serialized.slice(0, MAX_SOURCE_PAYLOAD_LENGTH),
  }
}

function prepareRows(
  rows: VocabularyDatasetImportRow[],
  defaultLexicalType: string,
  metadataInput: VocabularyDatasetImportMetadata,
) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS_PER_BATCH) {
    throw new Error("데이터는 한 번에 1~100개씩 처리할 수 있습니다.")
  }
  if (!LEXICAL_TYPES.has(defaultLexicalType)) {
    throw new Error("기본 표현 유형을 확인해 주세요.")
  }

  const sourceName = typeof metadataInput?.sourceName === "string" ? metadataInput.sourceName.trim() : ""
  const licenseName = typeof metadataInput?.licenseName === "string" ? metadataInput.licenseName.trim() : ""
  if (!sourceName || sourceName.length > 60 || !licenseName || licenseName.length > 40) {
    throw new Error("데이터 출처 이름과 라이선스 이름을 입력해 주세요.")
  }
  const sourceDatasetUrl = requireHttpsUrl(metadataInput.sourceDatasetUrl, "데이터 출처 주소")!
  const licenseUrl = metadataInput.licenseUrl
    ? requireHttpsUrl(metadataInput.licenseUrl, "라이선스 주소", true)
    : null
  const metadata = { sourceName, sourceDatasetUrl, licenseName, licenseUrl }

  const prepared = rows.map((row, index) => {
    if (!isRecord(row)) throw new Error((index + 1) + "번째 데이터 형식이 올바르지 않습니다.")
    const expression = typeof row.expression === "string" ? row.expression.trim().replace(/\s+/g, " ") : ""
    const normalizedExpression = normalizeDictionaryExpression(expression)
    const definitionEn = typeof row.definitionEn === "string" ? row.definitionEn.trim() : ""
    if (!normalizedExpression || normalizedExpression.length > 120 || !definitionEn || definitionEn.length > 8000) {
      throw new Error((index + 1) + "번째 데이터에 영어 표현 또는 영어 정의가 없거나 길이가 제한을 초과했습니다.")
    }
    const lexicalType = typeof row.lexicalType === "string" && LEXICAL_TYPES.has(row.lexicalType)
      ? row.lexicalType
      : defaultLexicalType
    const partOfSpeech = typeof row.partOfSpeech === "string" && row.partOfSpeech.trim()
      ? row.partOfSpeech.trim().toLocaleLowerCase("en-US").slice(0, 40)
      : "unknown"
    const cefr = typeof row.cefrLevel === "string" ? row.cefrLevel.trim().toUpperCase() : ""
    const cefrLevel = CEFR_LEVELS.has(cefr) ? cefr : null
    const frequency = typeof row.frequencyRank === "number"
      ? row.frequencyRank
      : typeof row.frequencyRank === "string" && row.frequencyRank.trim()
        ? Number(row.frequencyRank)
        : null
    const frequencyRank = Number.isInteger(frequency) && frequency !== null && frequency > 0
      ? Math.min(frequency, 2147483647)
      : null
    const exampleSentence = typeof row.exampleSentence === "string" && row.exampleSentence.trim()
      ? row.exampleSentence.trim().slice(0, 5000)
      : null
    const sourceEntryUrl = typeof row.sourceEntryUrl === "string" && row.sourceEntryUrl.trim()
      ? requireHttpsUrl(row.sourceEntryUrl, (index + 1) + "번째 원문 주소", true) ?? sourceDatasetUrl
      : sourceDatasetUrl
    const sourceRecordId = typeof row.sourceRecordId === "string" && row.sourceRecordId.trim()
      ? row.sourceRecordId.trim().slice(0, 200)
      : null
    const senseKey = createHash("sha256")
      .update(definitionEn.toLocaleLowerCase("en-US").replace(/\s+/g, " "))
      .digest("hex")
      .slice(0, 24)

    return {
      expression,
      normalizedExpression,
      lexicalType,
      partOfSpeech,
      senseKey,
      definitionEn,
      meaningKo: null,
      exampleSentence,
      cefrLevel,
      childLevel: null,
      frequencyRank,
      difficultyVerified: false,
      verificationStatus: "dictionary_found",
      sourceName,
      sourceEntryUrl,
      licenseName,
      licenseUrl,
      sourcePayload: safeSourcePayload(row.sourcePayload, metadata, sourceRecordId),
      dictionaryFetchedAt: new Date(),
    }
  })

  return prepared
}

function candidateKey(row: {
  normalizedExpression: string
  lexicalType: string
  partOfSpeech: string
  senseKey: string
}) {
  return [row.normalizedExpression, row.lexicalType, row.partOfSpeech, row.senseKey].join("|")
}

/**
 * Read-only preflight used before import confirmation. It counts exact matches
 * already present in the shared pool; the database unique index remains the
 * final protection against races and repeated uploads.
 */
export async function previewVocabularyDatasetImport(input: {
  rows: VocabularyDatasetImportRow[]
  defaultLexicalType: string
  metadata: VocabularyDatasetImportMetadata
}) {
  await requireSuperAdmin()
  const prepared = prepareRows(input?.rows, input?.defaultLexicalType, input?.metadata)
  const unique = new Map(prepared.map((row) => [candidateKey(row), row]))
  const normalizedExpressions = [...new Set(prepared.map((row) => row.normalizedExpression))]
  const existing = await db.select({
    normalizedExpression: vocabularyCandidates.normalizedExpression,
    lexicalType: vocabularyCandidates.lexicalType,
    partOfSpeech: vocabularyCandidates.partOfSpeech,
    senseKey: vocabularyCandidates.senseKey,
  }).from(vocabularyCandidates)
    .where(inArray(vocabularyCandidates.normalizedExpression, normalizedExpressions))
  const existingKeys = new Set(existing.map(candidateKey))
  const alreadyExists = [...unique.keys()].filter((key) => existingKeys.has(key)).length
  return {
    received: prepared.length,
    uniqueInBatch: unique.size,
    duplicateInDatabase: alreadyExists,
    expectedNew: unique.size - alreadyExists,
  }
}

/** Stage data only. Imported records are never auto-translated or auto-approved. */
export async function stageVocabularyDatasetImport(input: {
  rows: VocabularyDatasetImportRow[]
  defaultLexicalType: string
  metadata: VocabularyDatasetImportMetadata
}) {
  await requireSuperAdmin()
  const prepared = prepareRows(input?.rows, input?.defaultLexicalType, input?.metadata)
  const inserted = await db.insert(vocabularyCandidates)
    .values(prepared)
    .onConflictDoNothing()
    .returning({ id: vocabularyCandidates.id })

  revalidatePath("/super-admin/vocabulary")
  return {
    received: prepared.length,
    added: inserted.length,
    skippedAsDuplicate: prepared.length - inserted.length,
  }
}
