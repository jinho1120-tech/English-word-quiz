export type ExtractedWord = { word: string; meaning: string; example: string }

export async function extractWordsFromImage(base64Image: string, mimeType: string): Promise<ExtractedWord[]> {
  if (typeof base64Image !== "string" || !base64Image || base64Image.length > 10_000_000) {
    throw new Error("이미지는 7.5MB 이하로 올려 주세요.")
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("JPG, PNG, WEBP 이미지만 지원합니다.")
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

  const prompt = `
이미지에서 영어 학습 단어 목록을 추출하세요.
- 회화 문장이나 문장형 표현은 제외하고 단어 또는 고유명사구만 추출합니다.
- 각 항목은 영어 word, 자연스러운 한국어 meaning, 영어 example을 반환합니다.
- 뜻의 괄호/대괄호 안 보충 설명, 숫자, 불필요한 기호, 반의어·유의어 표기는 제거합니다.
- 뜻이 명확하지 않으면 빈 문자열로 두고 추측하지 않습니다.
- example은 이미지에 실제로 있는 예문 또는 영어 정의만 사용하고, 없으면 빈 문자열로 둡니다.
- 중복 단어는 한 번만 반환합니다.
순수 JSON 배열만 반환하세요. 형식: [{"word":"apple","meaning":"사과","example":""}]
`.trim()

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`
  let response: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    })
    if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) break
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
  }

  if (!response?.ok) throw new Error(response?.status === 429 ? "AI 요청이 많습니다. 잠시 후 다시 시도해 주세요." : "AI 이미지 분석에 실패했습니다.")
  const payload = await response.json()
  const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof raw !== "string") throw new Error("AI가 단어 목록을 반환하지 않았습니다.")

  let parsed: unknown
  try { parsed = JSON.parse(raw.replace(/```json/g, "").replace(/```/g, "").trim()) }
  catch { throw new Error("AI 응답을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.") }
  if (!Array.isArray(parsed)) throw new Error("AI 응답 형식이 올바르지 않습니다.")

  const words = parsed.slice(0, 100).flatMap((item): ExtractedWord[] => {
    if (!item || typeof item !== "object") return []
    const value = item as Record<string, unknown>
    const word = typeof value.word === "string" ? value.word.trim().slice(0, 100) : ""
    const meaning = typeof value.meaning === "string" ? value.meaning.trim().slice(0, 200) : ""
    const example = typeof value.example === "string" ? value.example.trim().slice(0, 2000) : ""
    return word && meaning ? [{ word, meaning, example }] : []
  })
  if (!words.length) throw new Error("사진에서 단어와 뜻을 찾지 못했습니다.")
  return words
}
