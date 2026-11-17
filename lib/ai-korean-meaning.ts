import "server-only"

export type KoreanMeaningDraftInput = {
  expression: string
  partOfSpeech: string
  verifiedDefinitionEn: string
  dictionaryTranslations?: string[]
}

/**
 * One Gemini request handles many verified meanings, even when they belong
 * to different expressions. This minimizes daily request-count usage.
 */
export async function generateKoreanMeaningDrafts(input:{
  items:KoreanMeaningDraftInput[]
}):Promise<(string|null)[]>{
  const items=input.items.slice(0,100)
  if(!items.length)return []
  const apiKey=process.env.GEMINI_API_KEY?.trim()
  if(!apiKey)return items.map(()=>null)

  const context=items.map((item,index)=>({
    index:index+1,
    expression:item.expression.trim().slice(0,120),
    partOfSpeech:item.partOfSpeech.trim().slice(0,40),
    verifiedDefinitionEn:item.verifiedDefinitionEn.trim().slice(0,1200),
    dictionaryKoreanHints:(item.dictionaryTranslations??[]).slice(0,3).map(value=>value.trim().slice(0,120)),
  }))
  const prompt=`
당신은 영어 어휘 학습용 한영 사전 편집자입니다.
아래 항목은 FreeDictionaryAPI에서 영어 표제어·품사·정의가 확인된 개별 의미입니다.
각 항목마다 단어 카드에서 외우기 쉬운 **짧은 한국어 핵심 뜻**만 작성하세요.

작성 규칙:
- 뜻은 보통 1~3개의 짧은 한국어 어휘 또는 구절로 작성합니다.
- 가능하면 24자 이내로 작성합니다.
- 긴 문장형 번역, 사전식 해설, 예문, 괄호 설명은 쓰지 마세요.
- 각 항목은 그 항목의 영어 정의에 맞는 대표 뜻 하나만 간결하게 적습니다.
- 서로 다른 의미를 합치거나 정의에 없는 뜻을 추측하지 마세요.
- 한국어 사전 번역은 참고 자료입니다. 길거나 설명문이면 복사하지 말고 핵심 뜻으로 줄이세요.
- 간결하고 정확한 뜻을 만들 수 없으면 빈 문자열을 반환하세요.
- 입력 순서와 개수를 유지하고 빠뜨리거나 추가하지 마세요.

JSON 객체만 반환하세요. 형식:
{"meanings":[{"index":1,"meaningKo":"모든, 전부의"},{"index":2,"meaningKo":"또한"}]}

의미 목록:
${JSON.stringify(context)}
`.trim()

  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:AbortSignal.timeout(12000),
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}}),
    })
    if(!response.ok)return items.map(()=>null)
    const payload:unknown=await response.json()
    if(!payload||typeof payload!=="object")return items.map(()=>null)
    const candidates=(payload as Record<string,unknown>).candidates
    if(!Array.isArray(candidates)||!candidates[0]||typeof candidates[0]!=="object")return items.map(()=>null)
    const candidateContent=(candidates[0] as Record<string,unknown>).content
    if(!candidateContent||typeof candidateContent!=="object")return items.map(()=>null)
    const parts=(candidateContent as Record<string,unknown>).parts
    if(!Array.isArray(parts)||!parts[0]||typeof parts[0]!=="object")return items.map(()=>null)
    const raw=(parts[0] as Record<string,unknown>).text
    if(typeof raw!=="string")return items.map(()=>null)
    const parsed:unknown=JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim())
    if(!parsed||typeof parsed!=="object")return items.map(()=>null)
    const meanings=(parsed as Record<string,unknown>).meanings
    if(!Array.isArray(meanings))return items.map(()=>null)
    const result:(string|null)[]=items.map(()=>null)
    for(const entry of meanings){
      if(!entry||typeof entry!=="object")continue
      const record=entry as Record<string,unknown>
      const index=record.index
      const meaning=record.meaningKo
      if(!Number.isInteger(index)||Number(index)<1||Number(index)>items.length||typeof meaning!=="string")continue
      const cleaned=meaning.trim().replace(/^[-•*`"'“”‘’]+|[-•*`"'“”‘’]+$/g,"").replace(/\s+/g," ")
      if(cleaned.length>0&&cleaned.length<=50&&!/[.!?。！？]/.test(cleaned))result[Number(index)-1]=cleaned
    }
    return result
  }catch{return items.map(()=>null)}
}

/** Backwards-compatible helper for the single-candidate retry button. */
export async function generateKoreanMeaningDraft(input:KoreanMeaningDraftInput):Promise<string|null>{
  const [meaning]=await generateKoreanMeaningDrafts({items:[input]})
  return meaning??null
}
