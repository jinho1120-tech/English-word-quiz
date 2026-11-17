"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileUp, Database, Eye, ShieldCheck, Upload } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import {
  previewVocabularyDatasetImport,
  stageVocabularyDatasetImport,
  type VocabularyDatasetImportMetadata,
  type VocabularyDatasetImportRow,
} from "@/app/actions/vocabulary-dataset-import"

type DatasetRecord = Record<string, unknown>
type FieldMap = {
  expression: string
  definitionEn: string
  partOfSpeech: string
  exampleSentence: string
  cefrLevel: string
  frequencyRank: string
  lexicalType: string
  sourceEntryUrl: string
  sourceRecordId: string
}
type SourcePreset = "worduniversum" | "oewn" | "custom"

const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_RECORDS = 5000
const PREVIEW_BATCH_SIZE = 100
const IMPORT_BATCH_SIZE = 50
const LEXICAL_TYPES = [
  { value: "word", label: "단어" },
  { value: "idiom", label: "숙어" },
  { value: "phrasal_verb", label: "구동사" },
  { value: "collocation", label: "연어" },
]
const EMPTY_MAP: FieldMap = {
  expression: "",
  definitionEn: "",
  partOfSpeech: "",
  exampleSentence: "",
  cefrLevel: "",
  frequencyRank: "",
  lexicalType: "",
  sourceEntryUrl: "",
  sourceRecordId: "",
}
const PRESETS: Record<SourcePreset, VocabularyDatasetImportMetadata> = {
  worduniversum: {
    sourceName: "WortUniversum",
    sourceDatasetUrl: "https://huggingface.co/datasets/cstr/grundwortschatz-voc-en",
    licenseName: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  oewn: {
    sourceName: "Open English WordNet",
    sourceDatasetUrl: "https://en-word.net/downloads",
    licenseName: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  custom: {
    sourceName: "",
    sourceDatasetUrl: "",
    licenseName: "",
    licenseUrl: "",
  },
}

function isRecord(value: unknown): value is DatasetRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseCsv(input: string): DatasetRecord[] {
  const matrix: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""))
      if (row.some((value) => value.trim())) matrix.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }
  row.push(cell.replace(/\r$/, ""))
  if (row.some((value) => value.trim())) matrix.push(row)
  if (matrix.length < 2) throw new Error("CSV에 머리글 행과 데이터 행이 모두 있어야 합니다.")

  const headers = matrix[0].map((value, index) => value.trim() || "column_" + (index + 1))
  return matrix.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ))
}

function parseDatasetText(input: string, fileName: string): DatasetRecord[] {
  const extension = fileName.toLocaleLowerCase("en-US").split(".").pop() ?? ""
  if (extension === "csv" || extension === "tsv") {
    if (extension === "tsv") {
      const converted = input.split(/\r?\n/).map((line) => line.split("\t").map((part) => {
        const value = part.replace(/"/g, '""')
        return '"' + value + '"'
      }).join(",")).join("\n")
      return parseCsv(converted)
    }
    return parseCsv(input)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    try {
      const records = lines.map((line) => JSON.parse(line))
      if (records.length > 0 && records.every(isRecord)) return records
    } catch {
      // The message below is more useful than exposing an implementation error.
    }
    throw new Error("JSON 또는 JSONL 파일을 읽지 못했습니다. 압축을 푼 .json/.jsonl 파일을 선택해 주세요.")
  }

  if (Array.isArray(parsed)) {
    const records = parsed.filter(isRecord)
    if (!records.length) throw new Error("JSON 배열 안에서 읽을 수 있는 객체를 찾지 못했습니다.")
    return records
  }
  if (isRecord(parsed)) {
    for (const key of ["items", "entries", "words", "results", "data", "records"]) {
      const value = parsed[key]
      if (Array.isArray(value) && value.some(isRecord)) return value.filter(isRecord)
    }
    const values = Object.entries(parsed)
    if (values.length > 0 && values.every(([, value]) => isRecord(value))) {
      return values.map(([id, value]) => {
        const record = value as DatasetRecord
        return { ...record, id: record.id ?? id }
      })
    }
  }
  throw new Error("JSON에서 어휘 레코드 배열을 찾지 못했습니다. 각 항목이 객체인 배열 또는 JSONL 형식이어야 합니다.")
}

function findKey(keys: string[], aliases: string[]) {
  const normalized = new Map(keys.map((key) => [key.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, ""), key]))
  for (const alias of aliases) {
    const found = normalized.get(alias.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, ""))
    if (found) return found
  }
  return ""
}

function readString(record: DatasetRecord, key: string) {
  if (!key) return ""
  const value = record[key]
  if (typeof value === "string" || typeof value === "number") return String(value).trim()
  return ""
}

function parseNestedObject(value: unknown): DatasetRecord | null {
  if (isRecord(value)) return value
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function textList(value: unknown): string[] {
  const parsed = parseJsonValue(value)
  if (typeof parsed === "string") return parsed.trim() ? [parsed.trim()] : []
  if (Array.isArray(parsed)) {
    return parsed.map((item) => firstText(item)).filter(Boolean)
  }
  if (isRecord(parsed)) {
    for (const key of ["definitions", "senses", "glosses", "meanings"]) {
      if (parsed[key] !== undefined) {
        const found = textList(parsed[key])
        if (found.length) return found
      }
    }
    const found = firstText(parsed)
    return found ? [found] : []
  }
  return []
}

function firstText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstText(item)
      if (found) return found
    }
  }
  if (isRecord(value)) {
    for (const key of ["text", "sentence", "example", "value", "gloss", "definition", "meaning"]) {
      const found = firstText(value[key])
      if (found) return found
    }
    for (const nested of Object.values(value)) {
      const found = firstText(nested)
      if (found) return found
    }
  }
  return ""
}

function prepareMappedRecords(
  records: DatasetRecord[],
  fieldMap: FieldMap,
  defaultLexicalType: string,
  sourcePreset: SourcePreset,
) {
  const rows: VocabularyDatasetImportRow[] = []
  const seen = new Set<string>()
  let invalid = 0
  let duplicatesInFile = 0

  for (const record of records) {
    const expression = readString(record, fieldMap.expression).replace(/\s+/g, " ")
    const isWortUniversumPhrasal = sourcePreset === "worduniversum" && typeof record.phrasal === "string"
    const enrichment = sourcePreset === "worduniversum" ? parseNestedObject(record.enrichment_json) : null
    const datasetMetadata = sourcePreset === "worduniversum" ? parseNestedObject(record.metadata_json) : null
    const mappedDefinition = readString(record, fieldMap.definitionEn)
    const nestedDefinitions = Array.isArray(enrichment?.definitions)
      ? enrichment.definitions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
      : []
    const phrasalDefinitions = isWortUniversumPhrasal
      ? textList(record.senses_json).length ? textList(record.senses_json) : [readString(record, "meaning")].filter(Boolean)
      : []
    const definitions = isWortUniversumPhrasal
      ? phrasalDefinitions
      : sourcePreset === "worduniversum" && fieldMap.definitionEn === "enrichment_json"
        ? nestedDefinitions
        : mappedDefinition ? [mappedDefinition] : nestedDefinitions
    const distinctDefinitions = [...new Set(definitions)]
    if (!expression || expression.length > 120 || distinctDefinitions.length === 0) {
      invalid += 1
      continue
    }

    const mappedType = readString(record, fieldMap.lexicalType).toLocaleLowerCase("en-US")
    const lexicalType = isWortUniversumPhrasal
      ? "phrasal_verb"
      : LEXICAL_TYPES.some((item) => item.value === mappedType) ? mappedType : defaultLexicalType
    const partOfSpeech = readString(record, fieldMap.partOfSpeech) || (isWortUniversumPhrasal ? "phrase" : "unknown")
    const rawFrequency = readString(record, fieldMap.frequencyRank)
    const frequencyRank = rawFrequency && /^\d+$/.test(rawFrequency) ? Number(rawFrequency) : null
    const nestedExample = isWortUniversumPhrasal
      ? firstText(parseJsonValue(record.wiktionary_examples_json)) || firstText(parseJsonValue(record.examples_json))
      : sourcePreset === "worduniversum"
        ? firstText(enrichment?.examples) || firstText(datasetMetadata?.gutenberg_examples)
        : ""
    const exampleSentence = readString(record, fieldMap.exampleSentence) || nestedExample
    const cefrLevel = readString(record, fieldMap.cefrLevel) ||
      (typeof datasetMetadata?.cefr_level === "string" ? datasetMetadata.cefr_level : "")
    const sourceRecordId = readString(record, fieldMap.sourceRecordId) || readString(record, "original_id")

    for (const definitionEn of distinctDefinitions) {
      if (!definitionEn || definitionEn.length > 8000 || rows.length >= MAX_RECORDS) {
        invalid += 1
        continue
      }
      const key = [
        expression.toLocaleLowerCase("en-US").replace(/\s+/g, " "),
        lexicalType,
        partOfSpeech.toLocaleLowerCase("en-US"),
        definitionEn.toLocaleLowerCase("en-US").replace(/\s+/g, " "),
      ].join("|")
      if (seen.has(key)) {
        duplicatesInFile += 1
        continue
      }
      seen.add(key)
      rows.push({
        expression,
        definitionEn,
        partOfSpeech,
        exampleSentence: exampleSentence || undefined,
        lexicalType,
        cefrLevel: cefrLevel || undefined,
        frequencyRank,
        sourceEntryUrl: readString(record, fieldMap.sourceEntryUrl) || undefined,
        sourceRecordId: sourceRecordId || undefined,
        sourcePayload: record,
      })
    }
  }

  return { rows, invalid, duplicatesInFile }
}

function inferredMap(records: DatasetRecord[], sourcePreset: SourcePreset): FieldMap {
  const keys = records.length ? Object.keys(records[0]) : []
  const isWortUniversum = sourcePreset === "worduniversum"
  return {
    expression: findKey(keys, ["lemma", "word", "expression", "headword", "term", "entry", "writtenform", "phrasal"]),
    definitionEn: findKey(keys, isWortUniversum
      ? ["enrichment_json", "senses_json", "definition", "definition_en", "gloss", "meaning_en", "def", "description"]
      : ["definition", "definition_en", "gloss", "meaning_en", "def", "description", "senses_json"]),
    partOfSpeech: findKey(keys, ["part_of_speech", "partofspeech", "pos", "grammatical_category", "word_type"]),
    exampleSentence: findKey(keys, ["example", "example_sentence", "sentence", "exampletext"]),
    cefrLevel: findKey(keys, ["cefr", "cefr_level", "cefrlevel"]),
    frequencyRank: findKey(keys, ["frequency_rank", "frequencyrank", "rank", "word_frequency_rank"]),
    lexicalType: findKey(keys, ["lexical_type", "lexicaltype"]),
    sourceEntryUrl: findKey(keys, ["source_entry_url", "sourceentryurl", "source_url", "url"]),
    sourceRecordId: findKey(keys, ["original_id", "record_id", "recordid", "id", "synset_id", "synsetid"]),
  }
}

function fieldLabel(field: keyof FieldMap) {
  const labels: Record<keyof FieldMap, string> = {
    expression: "영어 표현 / 표제어",
    definitionEn: "영어 정의",
    partOfSpeech: "품사",
    exampleSentence: "예문",
    cefrLevel: "CEFR",
    frequencyRank: "빈도 순위",
    lexicalType: "표현 유형",
    sourceEntryUrl: "개별 원문 URL",
    sourceRecordId: "원본 레코드 ID",
  }
  return labels[field]
}

export function VocabularyDatasetImporter() {
  const router = useRouter()
  const [records, setRecords] = useState<DatasetRecord[]>([])
  const [fileName, setFileName] = useState("")
  const [fieldMap, setFieldMap] = useState<FieldMap>(EMPTY_MAP)
  const [sourcePreset, setSourcePreset] = useState<SourcePreset>("worduniversum")
  const [metadata, setMetadata] = useState<VocabularyDatasetImportMetadata>(PRESETS.worduniversum)
  const [defaultLexicalType, setDefaultLexicalType] = useState("word")
  const [preview, setPreview] = useState<{ total: number; invalid: number; fileDuplicates: number; databaseDuplicates: number; expectedNew: number } | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [progress, setProgress] = useState("")
  const [isPending, startTransition] = useTransition()

  const keys = useMemo(() => records.length ? Object.keys(records[0]) : [], [records])
  const mapped = useMemo(
    () => prepareMappedRecords(records, fieldMap, defaultLexicalType, sourcePreset),
    [records, fieldMap, defaultLexicalType, sourcePreset],
  )

  function resetPreview() {
    setPreview(null)
    setNotice("")
  }

  async function handleFile(file?: File) {
    setError("")
    setNotice("")
    setPreview(null)
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setError("파일은 최대 8MB까지 지원합니다. 더 큰 데이터는 여러 파일로 나누어 주세요.")
      return
    }
    try {
      const parsed = parseDatasetText(await file.text(), file.name)
      if (parsed.length > MAX_RECORDS) {
        throw new Error("한 파일에서 최대 " + MAX_RECORDS.toLocaleString("ko-KR") + "개 레코드까지 가져올 수 있습니다. 파일을 여러 개로 나누어 주세요.")
      }
      if (!parsed.length) throw new Error("파일에 가져올 데이터가 없습니다.")
      setRecords(parsed)
      setFileName(file.name)
      setFieldMap(inferredMap(parsed, sourcePreset))
      setNotice(parsed.length.toLocaleString("ko-KR") + "개 레코드를 읽었습니다. 아래 열 연결을 확인해 주세요.")
    } catch (cause) {
      setRecords([])
      setFileName("")
      setError(cause instanceof Error ? cause.message : "파일을 읽지 못했습니다.")
    }
  }

  function updateMetadata<K extends keyof VocabularyDatasetImportMetadata>(key: K, value: VocabularyDatasetImportMetadata[K]) {
    setMetadata((current) => ({ ...current, [key]: value }))
    resetPreview()
  }

  function selectPreset(value: SourcePreset) {
    setSourcePreset(value)
    setMetadata(PRESETS[value])
    if (records.length) setFieldMap(inferredMap(records, value))
    resetPreview()
  }

  function runPreview() {
    setError("")
    setNotice("")
    if (!records.length || !mapped.rows.length) {
      setError("파일을 선택하고 영어 표현 및 영어 정의 열을 확인해 주세요.")
      return
    }
    if (!metadata.sourceName.trim() || !metadata.sourceDatasetUrl.trim() || !metadata.licenseName.trim()) {
      setError("데이터 출처 이름, 출처 URL, 라이선스를 입력해 주세요.")
      return
    }

    startTransition(async () => {
      try {
        let databaseDuplicates = 0
        for (let offset = 0; offset < mapped.rows.length; offset += PREVIEW_BATCH_SIZE) {
          const result = await previewVocabularyDatasetImport({
            rows: mapped.rows.slice(offset, offset + PREVIEW_BATCH_SIZE),
            defaultLexicalType,
            metadata,
          })
          databaseDuplicates += result.duplicateInDatabase
          setProgress("기존 후보 중복 확인 " + Math.min(offset + PREVIEW_BATCH_SIZE, mapped.rows.length).toLocaleString("ko-KR") + " / " + mapped.rows.length.toLocaleString("ko-KR"))
        }
        setPreview({
          total: mapped.rows.length,
          invalid: mapped.invalid,
          fileDuplicates: mapped.duplicatesInFile,
          databaseDuplicates,
          expectedNew: Math.max(0, mapped.rows.length - databaseDuplicates),
        })
        setNotice("미리보기가 완료되었습니다. 신규 후보 수와 출처·라이선스를 확인한 뒤 가져오기를 진행해 주세요.")
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "데이터 미리보기를 완료하지 못했습니다.")
      } finally {
        setProgress("")
      }
    })
  }

  function importDataset() {
    if (!preview || !mapped.rows.length) return
    setError("")
    setNotice("")
    startTransition(async () => {
      let added = 0
      let skipped = 0
      let processed = 0
      try {
        for (let offset = 0; offset < mapped.rows.length; offset += IMPORT_BATCH_SIZE) {
          const batch = mapped.rows.slice(offset, offset + IMPORT_BATCH_SIZE)
          const result = await stageVocabularyDatasetImport({
            rows: batch,
            defaultLexicalType,
            metadata,
          })
          added += result.added
          skipped += result.skippedAsDuplicate
          processed += batch.length
          setProgress("공용 후보 저장 중 " + processed.toLocaleString("ko-KR") + " / " + mapped.rows.length.toLocaleString("ko-KR"))
        }
        setNotice("가져오기 완료: 신규 " + added.toLocaleString("ko-KR") + "개, 중복 제외 " + skipped.toLocaleString("ko-KR") + "개. 모든 신규 항목은 검토 대기 상태입니다.")
        setPreview(null)
        setRecords([])
        setFileName("")
        router.refresh()
      } catch (cause) {
        setError((cause instanceof Error ? cause.message : "가져오기를 완료하지 못했습니다.") + " 이미 처리된 묶음은 저장되어 있습니다. 같은 파일을 다시 가져와도 중복 후보는 자동으로 건너뜁니다.")
      } finally {
        setProgress("")
      }
    })
  }

  const busy = isPending
  const mappedFields: (keyof FieldMap)[] = [
    "expression", "definitionEn", "partOfSpeech", "exampleSentence", "cefrLevel",
    "frequencyRank", "lexicalType", "sourceEntryUrl", "sourceRecordId",
  ]

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Database className="size-5" /> 공개 어휘 데이터셋 가져오기</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          공개 사이트·GitHub에서 받은 CSV, JSON, JSONL 파일을 올리면 열을 연결하고 중복을 미리 확인한 뒤 공용 후보 DB에 일괄 저장합니다. 최대 8MB, 파일당 5,000개 레코드를 지원합니다.
        </p>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
        <p className="text-xs font-bold">가져올 데이터 출처</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" disabled={busy} onClick={() => selectPreset("worduniversum")} className={`rounded-xl border px-3 py-2 text-left text-sm ${sourcePreset === "worduniversum" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-card"}`}>
            <span className="block font-semibold">WortUniversum</span><span className="mt-0.5 block text-xs opacity-75">CC BY-SA 4.0</span>
          </button>
          <button type="button" disabled={busy} onClick={() => selectPreset("oewn")} className={`rounded-xl border px-3 py-2 text-left text-sm ${sourcePreset === "oewn" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-card"}`}>
            <span className="block font-semibold">Open English WordNet</span><span className="mt-0.5 block text-xs opacity-75">CC BY 4.0</span>
          </button>
          <button type="button" disabled={busy} onClick={() => selectPreset("custom")} className={`rounded-xl border px-3 py-2 text-left text-sm ${sourcePreset === "custom" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-card"}`}>
            <span className="block font-semibold">기타 CSV / JSON</span><span className="mt-0.5 block text-xs opacity-75">직접 입력</span>
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">출처 이름</span><input value={metadata.sourceName} onChange={(event) => updateMetadata("sourceName", event.target.value)} disabled={busy} maxLength={60} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">라이선스</span><input value={metadata.licenseName} onChange={(event) => updateMetadata("licenseName", event.target.value)} disabled={busy} maxLength={40} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-muted-foreground">데이터셋 원문 주소</span><input value={metadata.sourceDatasetUrl} onChange={(event) => updateMetadata("sourceDatasetUrl", event.target.value)} disabled={busy} type="url" placeholder="https://..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-muted-foreground">라이선스 주소</span><input value={metadata.licenseUrl ?? ""} onChange={(event) => updateMetadata("licenseUrl", event.target.value)} disabled={busy} type="url" placeholder="https://creativecommons.org/..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
        </div>
        {sourcePreset === "worduniversum" && <p className="text-xs leading-relaxed text-muted-foreground">CSV/JSON으로 내보낸 words 테이블은 lemma·word_type·enrichment_json·metadata_json을 자동 해석하고, phrasal_verbs 테이블은 senses_json과 예문을 읽어 구동사 후보로 등록합니다. 영국 초등 학년 추정치는 원본 자료로 보존하며 L1~L6으로 자동 변환하지 않습니다. SQLite 원본은 먼저 CSV/JSON으로 내보내고 5,000행씩 나누어 주세요. <a href="https://huggingface.co/datasets/cstr/grundwortschatz-voc-en" target="_blank" rel="noreferrer" className="underline">데이터셋 페이지</a></p>}
        {sourcePreset === "oewn" && <p className="text-xs leading-relaxed text-muted-foreground">Open English WordNet은 단어 의미·관계 자료입니다. ZIP 파일을 내려받은 경우 압축을 풀고 표제어·품사·영어 정의를 평탄화한 CSV/JSON/JSONL 파일을 올려 주세요. 원본 JSON의 계층 구조를 그대로 올리는 방식은 아직 지원하지 않으며, 한국어 뜻이나 아동 난이도가 검증된 자료는 아니므로 검토가 필요합니다. <a href="https://en-word.net/downloads" target="_blank" rel="noreferrer" className="underline">다운로드 페이지</a></p>}
        {sourcePreset === "custom" && <p className="text-xs leading-relaxed text-muted-foreground">GitHub의 공개 데이터도 CSV/JSON/JSONL 파일로 내려받아 가져올 수 있습니다. 원본 데이터의 재사용 라이선스를 먼저 확인하고 출처를 정확히 기록해 주세요.</p>}
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background p-4">
        <FileUp className="size-6 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{fileName || "CSV / JSON / JSONL 파일 선택"}</span><span className="mt-0.5 block text-xs text-muted-foreground">UTF-8 텍스트 · 최대 8MB · 압축 파일은 먼저 해제</span></span>
        <span className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">파일 선택</span>
        <input type="file" accept=".csv,.tsv,.json,.jsonl,.txt,application/json,text/csv" disabled={busy} className="sr-only" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = "" }} />
      </label>

      {records.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">기본 표현 유형</span><select value={defaultLexicalType} disabled={busy} onChange={(event) => { setDefaultLexicalType(event.target.value); resetPreview() }} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">{LEXICAL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <div className="rounded-lg bg-muted/40 px-3 py-2"><span className="text-xs text-muted-foreground">읽은 데이터</span><p className="mt-0.5 text-lg font-bold tabular-nums">{records.length.toLocaleString("ko-KR")}개 레코드</p></div>
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div><h3 className="text-sm font-bold">파일 열 연결</h3><p className="mt-1 text-xs text-muted-foreground">자동으로 선택된 열을 확인해 주세요. 영어 표현과 영어 정의는 필수입니다.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {mappedFields.map((field) => (
                <label key={field} className="block space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">{fieldLabel(field)}{(field === "expression" || field === "definitionEn") ? " · 필수" : ""}</span>
                  <select value={fieldMap[field]} disabled={busy} onChange={(event) => { setFieldMap((current) => ({ ...current, [field]: event.target.value })); resetPreview() }} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm">
                    <option value="">사용 안 함</option>
                    {keys.map((key) => <option key={key} value={key}>{key}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">가져오기 전 데이터 점검</p><span className="text-xs text-muted-foreground">미리보기 {mapped.rows.length.toLocaleString("ko-KR")}개 · 파일 중복 {mapped.duplicatesInFile.toLocaleString("ko-KR")}개 · 필수값 누락 {mapped.invalid.toLocaleString("ko-KR")}개</span></div>
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {mapped.rows.slice(0, 8).map((row, index) => <div key={row.expression + index} className="rounded-lg bg-background px-2.5 py-2"><p className="text-sm font-semibold">{row.expression}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.definitionEn}</p></div>)}
              {mapped.rows.length > 8 && <p className="px-1 pt-1 text-xs text-muted-foreground">나머지 {(mapped.rows.length - 8).toLocaleString("ko-KR")}개는 일괄 처리됩니다.</p>}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <HapticButton type="button" disabled={busy || !mapped.rows.length} onClick={runPreview} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold disabled:opacity-50"><Eye className="size-4" /> {busy ? (progress || "확인 중…") : "DB 중복 미리 확인"}</HapticButton>
            <HapticButton type="button" disabled={busy || !preview || preview.expectedNew <= 0} onClick={importDataset} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><Upload className="size-4" /> {busy ? (progress || "가져오는 중…") : "신규 후보 DB에 가져오기"}</HapticButton>
          </div>
          {preview && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4" /> 미리보기 결과</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">가져올 유효 행</p><p className="mt-1 text-lg font-bold tabular-nums">{preview.total.toLocaleString("ko-KR")}</p></div>
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">파일 내부 중복</p><p className="mt-1 text-lg font-bold tabular-nums">{preview.fileDuplicates.toLocaleString("ko-KR")}</p></div>
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">DB 기존 중복</p><p className="mt-1 text-lg font-bold tabular-nums">{preview.databaseDuplicates.toLocaleString("ko-KR")}</p></div>
                <div className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">신규 예상</p><p className="mt-1 text-lg font-bold tabular-nums">{preview.expectedNew.toLocaleString("ko-KR")}</p></div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">가져오기를 실행하면 신규 예상 항목만 추가됩니다. 저장된 항목은 모두 검토 대기 상태이며, 한국어 뜻·L1~L6 난이도를 확인하기 전에는 테스트에 출제되지 않습니다.</p>
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm">{notice}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">중간에 네트워크가 끊겨도 이미 저장된 묶음은 유지됩니다. 같은 파일을 다시 가져오면 고유 키로 중복을 건너뜁니다. 외부 데이터의 번역·학년·CEFR 값은 검증된 서비스 레벨로 자동 승인하지 않습니다.</p>
    </section>
  )
}
