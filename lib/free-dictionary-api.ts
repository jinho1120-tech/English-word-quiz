import "server-only"

export type DictionaryTranslation = { languageCode: string; languageName: string; word: string }
export type DictionarySense = {
  partOfSpeech: string
  definition: string
  examples: string[]
  translations: DictionaryTranslation[]
}
export type DictionaryLookupResult =
  | { status:"found"; word:string; senses:DictionarySense[]; sourceUrl:string; licenseName:string; licenseUrl:string; payload:Record<string,unknown> }
  | { status:"not_found"; word:string }
  | { status:"unavailable"; word:string; reason:"rate_limited"|"timeout"|"upstream_error" }

type ApiSense = { definition?:unknown; examples?:unknown; translations?:unknown; subsenses?:unknown }
type ApiEntry = { language?:{code?:unknown}|null; partOfSpeech?:unknown; senses?:unknown }
type ApiPayload = { word?:unknown; entries?:unknown; source?:{url?:unknown;license?:{name?:unknown;url?:unknown}|null}|null }
const DEFAULT_LICENSE_NAME="CC BY-SA 4.0"
const DEFAULT_LICENSE_URL="https://creativecommons.org/licenses/by-sa/4.0/"

function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value)
}
function parseTranslations(value:unknown):DictionaryTranslation[]{
  if(!Array.isArray(value)) return []
  const result:DictionaryTranslation[]=[]
  for(const item of value){
    if(!isRecord(item)||!isRecord(item.language)||typeof item.word!=="string") continue
    const languageCode=typeof item.language.code==="string"?item.language.code.trim().toLowerCase():""
    const languageName=typeof item.language.name==="string"?item.language.name.trim():""
    const word=item.word.trim()
    if(languageCode&&word) result.push({languageCode,languageName,word})
    if(result.length>=30) break
  }
  return result
}
function flattenSenses(value:unknown,output:ApiSense[]=[],depth=0):ApiSense[]{
  if(!Array.isArray(value)||depth>6||output.length>=100) return output
  for(const item of value){
    if(!isRecord(item)) continue
    const definition=typeof item.definition==="string"?item.definition.trim():""
    if(definition) output.push({
      definition,
      examples:Array.isArray(item.examples)?item.examples.filter((v):v is string=>typeof v==="string"&&v.trim().length>0).slice(0,5):[],
      translations:parseTranslations(item.translations),
    })
    flattenSenses(item.subsenses,output,depth+1)
    if(output.length>=100) break
  }
  return output
}
export function normalizeDictionaryExpression(value:string):string{
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g," ")
}

/** Request per-sense translations; Korean is labelled as dictionary-sourced only when language.code is "ko". */
export async function lookupFreeDictionary(expression:string):Promise<DictionaryLookupResult>{
  const normalized=normalizeDictionaryExpression(expression)
  if(!normalized||normalized.length>100) throw new Error("영어 표현은 1~100자로 입력해 주세요.")
  const endpoint=`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(normalized)}?translations=true`
  let response:Response
  try{
    response=await fetch(endpoint,{method:"GET",headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(7000)})
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")
    return {status:"unavailable",word:normalized,reason:timeout?"timeout":"upstream_error"}
  }
  if(response.status===404) return {status:"not_found",word:normalized}
  if(response.status===429) return {status:"unavailable",word:normalized,reason:"rate_limited"}
  if(!response.ok) return {status:"unavailable",word:normalized,reason:"upstream_error"}
  let raw:unknown
  try{raw=await response.json()}catch{return {status:"unavailable",word:normalized,reason:"upstream_error"}}
  if(!isRecord(raw)) return {status:"unavailable",word:normalized,reason:"upstream_error"}
  const payload=raw as ApiPayload
  const entries=Array.isArray(payload.entries)?payload.entries:[]
  const senses:DictionarySense[]=[]
  for(const value of entries){
    if(!isRecord(value)) continue
    const entry=value as ApiEntry
    const language=isRecord(entry.language)&&typeof entry.language.code==="string"?entry.language.code:null
    if(language&&!/^en(?:-|$)/i.test(language)) continue
    const partOfSpeech=typeof entry.partOfSpeech==="string"?entry.partOfSpeech.trim().toLowerCase():"unknown"
    for(const sense of flattenSenses(entry.senses)){
      if(typeof sense.definition!=="string"||!sense.definition.trim()) continue
      senses.push({
        partOfSpeech,definition:sense.definition.trim(),
        examples:Array.isArray(sense.examples)?sense.examples.filter((v):v is string=>typeof v==="string").slice(0,5):[],
        translations:Array.isArray(sense.translations)?sense.translations as DictionaryTranslation[]:[],
      })
      if(senses.length>=100) break
    }
    if(senses.length>=100) break
  }
  if(!senses.length) return {status:"not_found",word:normalized}
  const source=isRecord(payload.source)?payload.source:{}
  const license=isRecord(source.license)?source.license:{}
  return {
    status:"found",
    word:typeof payload.word==="string"?payload.word:normalized,
    senses,
    sourceUrl:typeof source.url==="string"?source.url:`https://en.wiktionary.org/wiki/${encodeURIComponent(normalized.replace(/\s+/g,"_"))}`,
    licenseName:typeof license.name==="string"?license.name:DEFAULT_LICENSE_NAME,
    licenseUrl:typeof license.url==="string"?license.url:DEFAULT_LICENSE_URL,
    payload:raw,
  }
}
