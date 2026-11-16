import "server-only"

export type DictionarySense = {
  partOfSpeech: string
  definition: string
  examples: string[]
}

export type DictionaryLookupResult =
  | {
      status: "found"
      word: string
      senses: DictionarySense[]
      sourceUrl: string
      licenseName: string
      licenseUrl: string
      payload: Record<string, unknown>
    }
  | { status: "not_found"; word: string }
  | { status: "unavailable"; word: string; reason: "rate_limited" | "timeout" | "upstream_error" }

type ApiSense = {
  definition?: unknown
  examples?: unknown
  subsenses?: unknown
}

type ApiEntry = {
  language?: { code?: unknown } | null
  partOfSpeech?: unknown
  senses?: unknown
}

type ApiPayload = {
  word?: unknown
  entries?: unknown
  source?: {
    url?: unknown
    license?: { name?: unknown; url?: unknown } | null
  } | null
}

const DEFAULT_LICENSE_NAME = "CC BY-SA 4.0"
const DEFAULT_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function flattenSenses(value: unknown, output: ApiSense[] = [], depth = 0): ApiSense[] {
  if (!Array.isArray(value) || depth > 6 || output.length >= 100) return output
  for (const item of value) {
    if (!isRecord(item)) continue
    const definition = typeof item.definition === "string" ? item.definition.trim() : ""
    if (definition) {
      output.push({
        definition,
        examples: Array.isArray(item.examples)
          ? item.examples.filter((example): example is string => typeof example === "string" && example.trim().length > 0).slice(0, 5)
          : [],
      })
    }
    flattenSenses(item.subsenses, output, depth + 1)
    if (output.length >= 100) break
  }
  return output
}

export function normalizeDictionaryExpression(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
}

/**
 * Calls FreeDictionaryAPI once for an exact English expression.
 * Not-found is deliberately distinct from transport/rate-limit failures:
 * an API outage must never be treated as an invalid learner submission.
 */
export async function lookupFreeDictionary(expression: string): Promise<DictionaryLookupResult> {
  const normalized = normalizeDictionaryExpression(expression)
  if (!normalized || normalized.length > 100) throw new Error("영어 표현은 1~100자로 입력해 주세요.")

  const endpoint = `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(normalized)}`
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    })
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    return { status: "unavailable", word: normalized, reason: isTimeout ? "timeout" : "upstream_error" }
  }

  if (response.status === 404) return { status: "not_found", word: normalized }
  if (response.status === 429) return { status: "unavailable", word: normalized, reason: "rate_limited" }
  if (!response.ok) return { status: "unavailable", word: normalized, reason: "upstream_error" }

  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    return { status: "unavailable", word: normalized, reason: "upstream_error" }
  }
  if (!isRecord(raw)) return { status: "unavailable", word: normalized, reason: "upstream_error" }

  const payload = raw as ApiPayload
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  const senses: DictionarySense[] = []
  for (const item of entries) {
    if (!isRecord(item)) continue
    const entry = item as ApiEntry
    const languageCode = isRecord(entry.language) && typeof entry.language.code === "string"
      ? entry.language.code
      : null
    if (languageCode && !/^en(?:-|$)/i.test(languageCode)) continue
    const partOfSpeech = typeof entry.partOfSpeech === "string" ? entry.partOfSpeech.trim().toLowerCase() : "unknown"
    const flattened = flattenSenses(entry.senses)
    for (const sense of flattened) {
      const definition = typeof sense.definition === "string" ? sense.definition.trim() : ""
      if (!definition) continue
      const examples = Array.isArray(sense.examples) ? sense.examples : []
      senses.push({
        partOfSpeech,
        definition,
        examples: examples.filter((example): example is string => typeof example === "string").slice(0, 5),
      })
      if (senses.length >= 100) break
    }
    if (senses.length >= 100) break
  }

  if (!senses.length) return { status: "not_found", word: normalized }

  const source = isRecord(payload.source) ? payload.source : {}
  const license = isRecord(source.license) ? source.license : {}
  const sourceUrl = typeof source.url === "string"
    ? source.url
    : `https://en.wiktionary.org/wiki/${encodeURIComponent(normalized.replace(/\s+/g, "_"))}`
  const licenseName = typeof license.name === "string" ? license.name : DEFAULT_LICENSE_NAME
  const licenseUrl = typeof license.url === "string" ? license.url : DEFAULT_LICENSE_URL

  return {
    status: "found",
    word: typeof payload.word === "string" ? payload.word : normalized,
    senses,
    sourceUrl,
    licenseName,
    licenseUrl,
    payload: raw,
  }
}
