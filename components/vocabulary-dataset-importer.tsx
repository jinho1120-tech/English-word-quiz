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
  gradeLevel: string
  gradeBand: string
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
  gradeLevel: "",
  gradeBand: "",
}
const PRESETS: Record<SourcePreset, VocabularyDatasetImportMetadata> = {
  worduniversum: {
    sourceName: "WortUniversum",
    sourceDatasetUrl: "https://huggingface.co/datasets/cstr/grundwortschatz-voc-en",
  },
  oewn: {
    sourceName: "Open English WordNet",
    sourceDatasetUrl: "https://en-word.net/downloads",
  },
  custom: {
    sourceName: "",
    sourceDatasetUrl: "",
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
    const expression = readString(record, fieldMap.expression).replace(/\\s+/g, " ")
    const isWortUniversumPhrasal = sourcePreset === "worduniversum" && Boolean(readString(record, "phrasal"))
    if (!expression || expression.length > 120) {
      invalid += 1
      continue
    }

    const lexicalType = isWortUniversumPhrasal ? "phrasal_verb" : defaultLexicalType
    const gradeLevel = readString(record, fieldMap.gradeLevel)
    const gradeBand = readString(record, fieldMap.gradeBand)
    const sourcePayload: DatasetRecord = {}
    if (gradeLevel) sourcePayload.grade_level = gradeLevel
    if (gradeBand) sourcePayload.grade_band = gradeBand

    const key = expression.toLocaleLowerCase("en-US").replace(/\\s+/g, " ") + "|" + lexicalType
    if (seen.has(key)) {
      duplicatesInFile += 1
      continue
    }
    seen.add(key)
    rows.push({ expression, lexicalType, sourcePayload })
  }

  return { rows, invalid, duplicatesInFile }
}

function inferredMap(records: DatasetRecord[], sourcePreset: SourcePreset): FieldMap {
  const keys = records.length ? Object.keys(records[0]) : []
  return {
    expression: findKey(keys, ["lemma", "phrasal", "word", "expression", "headword", "term", "entry", "writtenform"]),
    gradeLevel: findKey(keys, ["grade_level", "gradelevel", "grade", "grade_level_estimate"]),
    gradeBand: findKey(keys, ["grade_band", "gradeband"]),
  }
}

function fieldLabel(field: keyof FieldMap) {
  const labels: Record<keyof FieldMap, string> = {
    expression: "영어 표제어 / 구동사",
    gradeLevel: "원본 학년 (grade_level)",
    gradeBand: "원본 난이도 범위 (grade_band)",
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

  const previewGroups = useMemo(() => {
    const groups = new Map<string, { expression: string; lexicalType: string; levelLabel: string }>()
    for (const row of mapped.rows) {
      const lexicalType = row.lexicalType ?? defaultLexicalType
      const key = [row.expression.toLocaleLowerCase("en-US"), lexicalType].join("|")
      if (groups.has(key)) continue
      const source = row.sourcePayload ?? {}
      const gradeLevel = typeof source.grade_level === "string" ? source.grade_level : ""
      const gradeBand = typeof source.grade_band === "string" ? source.grade_band : ""
      const levelLabel = gradeLevel ? "원본 학년 " + gradeLevel : gradeBand ? "원본 범위 " + gradeBand : "원본 난이도 없음"
      groups.set(key, { expression: row.expression, lexicalType, levelLabel })
    }
    return { total: groups.size, items: [...groups.values()].slice(0, 8) }
  }, [mapped.rows, defaultLexicalType])

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
      setError("파일을 선택하고 영어 표제어 열을 확인해 주세요.")
      return
    }
    if (!metadata.sourceName.trim() || !metadata.sourceDatasetUrl.trim()) {
      setError("데이터 출처 이름과 출처 URL을 입력해 주세요.")
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
        setNotice("미리보기가 완료되었습니다. 표제어와 원본 난이도 매핑을 확인한 뒤 가져오기를 진행해 주세요.")
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
        setNotice("가져오기 완료: 신규 표제어 " + added.toLocaleString("ko-KR") + "개, 중복 제외 " + skipped.toLocaleString("ko-KR") + "개. 의미·품사·예문은 사전 조회 단계에서 채워집니다.")
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
  const mappedFields: (keyof FieldMap)[] = ["expression", "gradeLevel", "gradeBand"]

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Database className="size-5" /> 공개 어휘 데이터셋 가져오기</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          CSV/JSON 파일에서 영어 표제어와 원본 난이도만 가져옵니다. 뜻·품사·예문은 FreeDictionaryAPI에서 표제어별로 조회해 의미 후보를 만듭니다. 최대 8MB, 파일당 5,000개 레코드를 지원합니다.
        </p>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
        <p className="text-xs font-bold">가져올 데이터 출처</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" disabled={busy} onClick={() => selectPreset("worduniversum")} className={`rounded-xl border px-3 py-2 text-left text-sm ${sourcePreset === "worduniversum" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-card"}`}>
            <span className="block font-semibold">WortUniversum</span><span className="mt-0.5 block text-xs opacity-75">단어·구동사 난이도 데이터</span>
          </button>
          <button type="button" disabled={busy} onClick={() => selectPreset("oewn")} className={`rounded-xl border px-3 py-2 text-left text-sm ${sourcePreset === "oewn" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-card"}`}>
            <span className="block font-semibold">Open English WordNet</span><span className="mt-0.5 block text-xs opacity-75">표제어 데이터</span>
          </button>
          <button type="button" disabled={busy} onClick={() => selectPreset("custom")} className={`rounded-xl border px-3 py-2 text-left text-sm ${sourcePreset === "custom" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-card"}`}>
            <span className="block font-semibold">기타 CSV / JSON</span><span className="mt-0.5 block text-xs opacity-75">직접 입력</span>
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">출처 이름</span><input value={metadata.sourceName} onChange={(event) => updateMetadata("sourceName", event.target.value)} disabled={busy} maxLength={60} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-muted-foreground">데이터셋 원문 주소</span><input value={metadata.sourceDatasetUrl} onChange={(event) => updateMetadata("sourceDatasetUrl", event.target.value)} disabled={busy} type="url" placeholder="https://..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
        </div>
        {sourcePreset === "worduniversum" && <p className="text-xs leading-relaxed text-muted-foreground">CSV의 표제어와 grade_level / grade_band만 읽고, 원본 정의·품사·예문은 저장하지 않습니다. 사전 조회는 표제어 단위로 최대 5개씩 진행하며, 결과는 캐시에 보관해 반복 조회와 API 사용량을 줄입니다. SQLite 원본은 CSV/JSON으로 내보내고 5,000행씩 나누어 주세요. <a href="https://huggingface.co/datasets/cstr/grundwortschatz-voc-en" target="_blank" rel="noreferrer" className="underline">데이터셋 페이지</a></p>}
        {sourcePreset === "oewn" && <p className="text-xs leading-relaxed text-muted-foreground">표제어 열을 연결해 가져올 수 있습니다. 원본 난이도 열이 없다면 L1~L6은 미지정으로 남으므로 슈퍼 관리자 검토에서 난이도를 지정해야 합니다. <a href="https://en-word.net/downloads" target="_blank" rel="noreferrer" className="underline">다운로드 페이지</a></p>}
        {sourcePreset === "custom" && <p className="text-xs leading-relaxed text-muted-foreground">표제어 열과 난이도 열을 연결해 주세요. 뜻·품사·예문 열은 사용하지 않습니다. 데이터 출처는 내부 기록용으로 보관합니다.</p>}
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
            <div><h3 className="text-sm font-bold">파일 열 연결</h3><p className="mt-1 text-xs text-muted-foreground">자동으로 선택된 열을 확인해 주세요. 표제어는 필수입니다. grade_level 또는 grade_band가 있으면 연결해 주세요. 뜻·품사·예문 열은 사용하지 않습니다.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {mappedFields.map((field) => (
                <label key={field} className="block space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">{fieldLabel(field)}{field === "expression" ? " · 필수" : ""}</span>
                  <select value={fieldMap[field]} disabled={busy} onChange={(event) => { setFieldMap((current) => ({ ...current, [field]: event.target.value })); resetPreview() }} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm">
                    <option value="">사용 안 함</option>
                    {keys.map((key) => <option key={key} value={key}>{key}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">가져오기 전 데이터 점검</p><span className="text-xs text-muted-foreground">표제어 그룹 {previewGroups.total.toLocaleString("ko-KR")}개 · 사전 조회 대상 {mapped.rows.length.toLocaleString("ko-KR")}개</span></div>
            <p className="mt-1 text-xs text-muted-foreground">표제어와 원본 난이도만 후보 DB에 저장합니다. 사전 검증을 실행하면 FreeDictionaryAPI가 제공하는 의미별 정의·품사·예문·번역을 가져오고, 첫 번째 의미를 대표 의미로 제안합니다.</p>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {previewGroups.items.map((group) => <div key={group.expression + group.lexicalType} className="rounded-lg bg-background px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{group.expression}</p><span className="text-[11px] text-muted-foreground">{group.lexicalType === "phrasal_verb" ? "구동사" : group.lexicalType === "word" ? "단어" : group.lexicalType} · {group.levelLabel}</span></div>
              </div>)}
              {previewGroups.total > 8 && <p className="px-1 pt-1 text-xs text-muted-foreground">나머지 {(previewGroups.total - 8).toLocaleString("ko-KR")}개 표제어는 일괄 처리됩니다.</p>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">파일 중복 {mapped.duplicatesInFile.toLocaleString("ko-KR")}개 · 표제어 누락 {mapped.invalid.toLocaleString("ko-KR")}개</p>
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
              <p className="text-xs leading-relaxed text-muted-foreground">가져오기를 실행하면 신규 예상 항목만 추가됩니다. 저장된 후보는 FreeDictionaryAPI 의미·품사 검증, 한국어 뜻 제안, 원본 레벨 변환을 거친 뒤 관리자가 승인해야 출제됩니다.</p>
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm">{notice}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">중간에 네트워크가 끊겨도 이미 저장된 표제어는 유지됩니다. 같은 파일을 다시 가져오면 표현 유형 기준으로 중복을 건너뜁니다. FreeDictionaryAPI에서 의미·품사·예문·한국어 번역을 조회하며, 번역이 없으면 검증된 영어 정의를 바탕으로 Gemini 초안을 제안합니다. L1~L6은 원본 학년 신호의 고정 규칙으로 변환합니다.</p>
    </section>
  )
}
