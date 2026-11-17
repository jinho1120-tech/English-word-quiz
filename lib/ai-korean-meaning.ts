import "server-only"

export type KoreanMeaningSenseInput = {
  partOfSpeech: string
  verifiedDefinitionEn: string
  dictionaryTranslations?: string[]
}

/**
 * Generates short learner-facing glosses from already verified dictionary senses.
 * One model call handles all senses for one expression.
 */
export async function generateKoreanMeaningDrafts(input:{
  expression:string
  senses:KoreanMeaningSenseInput[]
}):Promise<(string|null)[]>{
  const senses=input.senses.slice(0,20)
  if(!senses.length)return []
  const apiKey=process.env.GEMINI_API_KEY?.trim()
  if(!apiKey)return senses.map(()=>null)
  const expression=input.expression.trim().slice(0,120)
  if(!expression)return senses.map(()=>null)

  const senseContext=senses.map((sense,index)=>({
    index:index+1,
    partOfSpeech:sense.partOfSpeech.trim().slice(0,40),
    verifiedDefinitionEn:sense.verifiedDefinitionEn.trim().slice(0,1200),
    dictionaryKoreanHints:(sense.dictionaryTranslations??[]).slice(0,3).map(value=>value.trim().slice(0,120)),
  }))
  const prompt=`
당신은 영어 어휘 학습용 한영 사전 편집자입니다.
아래 항목은 FreeDictionaryAPI에서 표제어와 품사 및 영어 정의를 확인한 개별 의미들입니다.
각 의미마다 학습자가 단어 카드에서 바로 외울 수 있는 **짧은 한국어 핵심 뜻**만 작성하세요.

작성 규칙:
- 각 뜻은 보통 1~3개의 짧은 한국어 어휘 또는 구절로 작성합니다.
- 가능하면 24자 이내로 작성합니다.
- 긴 문장형 번역, 주어·서술어가 있는 설명문, 사전식 해설, 예문, 괄호 설명은 쓰지 마세요.
- 의미가 여러 개면 해당 정의에 맞는 대표 뜻만 간결하게 적습니다. 서로 다른 의미를 합치지 마세요.
- 제공된 한국어 사전 번역은 참고 자료일 뿐입니다. 길거나 설명문이면 그대로 복사하지 말고 핵심 뜻으로 줄이세요.
- 영어 정의가 실제로 설명하는 의미를 벗어나 추측하지 마세요.
- 간결한 뜻을 만들 수 없으면 해당 항목의 meaningKo를 빈 문자열로 반환합니다.
- 입력 순서와 개수를 그대로 유지하고, 항목을 빠뜨리거나 추가하지 마세요.

JSON 객체만 반환하세요. 형식:
{"meanings":[{"index":1,"meaningKo":"모든, 전부의"}]}

표제어: ${expression}
의미 목록:
${JSON.stringify(senseContext)}
`.trim()

  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:AbortSignal.timeout(9000),
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}}),
    })
    if(!response.ok)return senses.map(()=>null)
    const payload:unknown=await response.json()
    if(!payload||typeof payload!=="object")return senses.map(()=>null)
    const candidates=(payload as Record<string,unknown>).candidates
    if(!Array.isArray(candidates)||!candidates[0]||typeof candidates[0]!=="object")return senses.map(()=>null)
    const candidateContent=(candidates[0] as Record<string,unknown>).content
    if(!candidateContent||typeof candidateContent!=="object")return senses.map(()=>null)
    const parts=(candidateContent as Record<string,unknown>).parts
    if(!Array.isArray(parts)||!parts[0]||typeof parts[0]!=="object")return senses.map(()=>null)
    const raw=(parts[0] as Record<string,unknown>).text
    if(typeof raw!=="string")return senses.map(()=>null)
    const parsed:unknown=JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim())
    if(!parsed||typeof parsed!=="object")return senses.map(()=>null)
    const meanings=(parsed as Record<string,unknown>).meanings
    if(!Array.isArray(meanings))return senses.map(()=>null)
    const result:(string|null)[]=senses.map(()=>null)
    for(const item of meanings){
      if(!item||typeof item!=="object")continue
      const record=item as Record<string,unknown>
      const index=record.index
      const meaning=record.meaningKo
      if(!Number.isInteger(index)||Number(index)<1||Number(index)>senses.length||typeof meaning!=="string")continue
      const cleaned=meaning.trim().replace(/^[-•*`"'“”‘’]+|[-•*`"'“”‘’]+$/g,"").replace(/\s+/g," ")
      if(cleaned.length>0&&cleaned.length<=50&&!/[.!?。！？]/.test(cleaned))result[Number(index)-1]=cleaned
    }
    return result
  }catch{return senses.map(()=>null)}
}

/** Backwards-compatible single-sense helper for manual retry actions. */
export async function generateKoreanMeaningDraft(input:{
  expression:string
  partOfSpeech:string
  verifiedDefinitionEn:string
  dictionaryTranslations?:string[]
}):Promise<string|null>{
  const [meaning]=await generateKoreanMeaningDrafts({
    expression:input.expression,
    senses:[{
      partOfSpeech:input.partOfSpeech,
      verifiedDefinitionEn:input.verifiedDefinitionEn,
      dictionaryTranslations:input.dictionaryTranslations,
    }],
  })
  return meaning??null
}
