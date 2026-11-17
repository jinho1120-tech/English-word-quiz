import "server-only"

/** Korean draft generated only from a FreeDictionaryAPI sense already matched by the caller. */
export async function generateKoreanMeaningDraft(input:{expression:string;partOfSpeech:string;verifiedDefinitionEn:string}):Promise<string|null>{
  const apiKey=process.env.GEMINI_API_KEY?.trim()
  if(!apiKey) return null
  const expression=input.expression.trim().slice(0,120)
  const partOfSpeech=input.partOfSpeech.trim().slice(0,40)
  const definition=input.verifiedDefinitionEn.trim().slice(0,3000)
  if(!expression||!definition) return null
  const prompt=`
FreeDictionaryAPI에서 표제어·품사·의미가 대조되어 확인된 영어 사전 정의 한 개입니다.
이 정의가 설명하는 바로 그 의미만 자연스럽고 간결한 한국어로 번역하세요.
- 정의에 없는 의미나 설명을 추가하지 마세요.
- 여러 의미를 합치거나 추측하지 마세요.
- 자신 있게 번역할 수 없으면 빈 문자열을 반환하세요.
JSON 객체만 반환하세요: {"meaningKo":"한국어 뜻"}
표제어: ${expression}
품사: ${partOfSpeech}
검증된 영어 정의: ${definition}
`.trim()
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:AbortSignal.timeout(7000),
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}}),
    })
    if(!response.ok) return null
    const payload:unknown=await response.json()
    if(!payload||typeof payload!=="object") return null
    const candidates=(payload as Record<string,unknown>).candidates
    if(!Array.isArray(candidates)||!candidates[0]||typeof candidates[0]!=="object") return null
    const content=(candidates[0] as Record<string,unknown>).content
    if(!content||typeof content!=="object") return null
    const parts=(content as Record<string,unknown>).parts
    if(!Array.isArray(parts)||!parts[0]||typeof parts[0]!=="object") return null
    const raw=(parts[0] as Record<string,unknown>).text
    if(typeof raw!=="string") return null
    const parsed:unknown=JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim())
    if(!parsed||typeof parsed!=="object") return null
    const meaning=(parsed as Record<string,unknown>).meaningKo
    if(typeof meaning!=="string") return null
    const cleaned=meaning.trim().replace(/\s+/g," ")
    return cleaned.length>0&&cleaned.length<=200?cleaned:null
  }catch{return null}
}
