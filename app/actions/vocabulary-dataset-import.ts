"use server"

import { createHash } from "node:crypto"
import { asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/super-admin"
import { vocabularyCandidates } from "@/lib/db/schema"
import { normalizeDictionaryExpression, type DictionarySense } from "@/lib/free-dictionary-api"
import { lookupFreeDictionaryCached } from "@/lib/free-dictionary-cache"
import { generateKoreanMeaningDraft } from "@/lib/ai-korean-meaning"

const LEXICAL_TYPES = new Set(["word", "idiom", "phrasal_verb", "collocation"])
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
const MAX_ROWS_PER_BATCH = 100
const MAX_SOURCE_PAYLOAD_LENGTH = 3500
const MAX_DICTIONARY_BATCH = 5

export type VocabularyDatasetImportRow = {
  expression: string
  definitionEn?: string
  partOfSpeech?: string
  exampleSentence?: string
  lexicalType?: string
  cefrLevel?: string
  frequencyRank?: number | string | null
  sourceEntryUrl?: string
  sourceRecordId?: string
  senseOrder?: number
  learningStage?: "primary" | "additional"
  sourcePayload?: Record<string, unknown>
}
export type VocabularyDatasetImportMetadata = {
  sourceName: string
  sourceDatasetUrl: string
  licenseName?: string
  licenseUrl?: string
}
function requireHttpsUrl(value:string,label:string,optional=false):string|null{
  const trimmed=value.trim()
  if(!trimmed&&optional) return null
  try{const url=new URL(trimmed);if(url.protocol!=="https:")throw new Error();return url.toString()}
  catch{throw new Error(label+"에는 https://로 시작하는 유효한 주소를 입력해 주세요.")}
}
function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value)
}
function parseRecord(value:unknown):Record<string,unknown>{
  if(isRecord(value))return value
  if(typeof value==="string"&&value.trim()){try{const parsed:unknown=JSON.parse(value);return isRecord(parsed)?parsed:{}}catch{return {}}}
  return {}
}
function finiteNumber(value:unknown):number|null{
  if(typeof value==="number"&&Number.isFinite(value))return value
  if(typeof value==="string"&&value.trim()&&Number.isFinite(Number(value)))return Number(value)
  return null
}
function normalizeCefr(value:unknown):string|null{
  if(typeof value!=="string")return null
  const level=value.trim().toUpperCase()
  return CEFR_LEVELS.has(level)?level:null
}
type LevelMapping={
  status:"mapped"|"unmapped"
  childLevel:string|null
  rule:string
  sourceSignals:{
    gradeLevel:number|null
    gradeLevelEstimate:number|null
    gradeBand:{min:number;max:number}|null
    cefrLevel:string|null
    yleLevel:string|null
    frequencyBand:number|null
    frequencyZipf:number|null
  }
}
/** Uses source level fields and fixed conversion rules. The AI model never assigns L1-L6. */
function deriveSourceLevelMapping(value:unknown,rowCefr?:string):LevelMapping{
  const row=parseRecord(value)
  const metadata=parseRecord(row.metadata_json)
  const frequency=parseRecord(row.frequency_json)
  const gradeLevel=finiteNumber(row.grade_level)
  const gradeLevelEstimate=finiteNumber(metadata.gradeLevelEstimate??row.gradeLevelEstimate)
  let gradeBand:{min:number;max:number}|null=null
  const bandRaw=row.grade_band
  if(typeof bandRaw==="string"){
    const nums=bandRaw.match(/(\d+(?:\.\d+)?)/g)?.map(Number)??[]
    if(nums.length>=2&&nums[0]>=1&&nums[1]<=6&&nums[0]<=nums[1])gradeBand={min:nums[0],max:nums[1]}
    else if(nums.length===1&&nums[0]>=1&&nums[0]<=6)gradeBand={min:nums[0],max:nums[0]}
  }else{
    const band=finiteNumber(bandRaw)
    if(band!==null&&band>=1&&band<=6)gradeBand={min:band,max:band}
  }
  const cefrLevel=normalizeCefr(rowCefr)??normalizeCefr(metadata.cefr_level)??normalizeCefr(row.cefr_level)
  const yleRaw=metadata.yle_level??row.yle_level
  const yleLevel=typeof yleRaw==="string"?yleRaw.trim():null
  const frequencyBand=finiteNumber(frequency.frequency_band??row.frequency_band)
  const frequencyZipf=finiteNumber(frequency.zipf??row.base_zipf??row.zipf)
  let grade:number|null=null
  let rule="원본 난이도 정보 없음"
  if(gradeLevel!==null&&Number.isInteger(gradeLevel)&&gradeLevel>=1&&gradeLevel<=6){
    grade=gradeLevel;rule="원본 grade_level 1~6을 서비스 L1~L6에 순서대로 대응"
  }else if(gradeLevelEstimate!==null&&Number.isInteger(gradeLevelEstimate)&&gradeLevelEstimate>=1&&gradeLevelEstimate<=6){
    grade=gradeLevelEstimate;rule="원본 metadata.gradeLevelEstimate 1~6을 서비스 L1~L6에 순서대로 대응"
  }else if(gradeBand){
    grade=Math.round((gradeBand.min+gradeBand.max)/2);rule=`원본 grade_band ${gradeBand.min}~${gradeBand.max}의 중앙 학년 ${grade}를 사용`
  }else if(yleLevel){
    const value=yleLevel.toLowerCase()
    if(value.includes("starter")){grade=1;rule="YLE Starters → L1"}
    else if(value.includes("mover")){grade=2;rule="YLE Movers → L2"}
    else if(value.includes("flyer")){grade=3;rule="YLE Flyers → L3"}
  }
  if(grade===null&&cefrLevel){
    const map:Record<string,number>={A1:2,A2:3,B1:4,B2:5,C1:6,C2:6}
    grade=map[cefrLevel];rule=`CEFR ${cefrLevel} → L${grade}`
  }
  if(grade===null&&frequencyBand!==null&&Number.isInteger(frequencyBand)){
    const map:Record<number,number>={1:1,2:2,3:3,4:5,5:6}
    grade=map[frequencyBand]??null
    if(grade!==null)rule=`원본 frequency_band ${frequencyBand} → L${grade}`
  }
  const childLevel=grade!==null&&grade>=1&&grade<=6?"L"+grade:null
  return {
    status:childLevel?"mapped":"unmapped",childLevel,rule,
    sourceSignals:{
      gradeLevel:gradeLevel!==null&&Number.isInteger(gradeLevel)?gradeLevel:null,
      gradeLevelEstimate:gradeLevelEstimate!==null&&Number.isInteger(gradeLevelEstimate)?gradeLevelEstimate:null,
      gradeBand,
      cefrLevel,
      yleLevel,
      frequencyBand:frequencyBand!==null&&Number.isInteger(frequencyBand)?frequencyBand:null,
      frequencyZipf,
    },
  }
}
function safeSourcePayload(value:unknown,metadata:VocabularyDatasetImportMetadata,sourceRecordId:string|null,levelMapping:LevelMapping,dictionaryMode:"lookup_by_expression"|"match_definition"){
  let serialized="{}"
  if(isRecord(value)){try{serialized=JSON.stringify(value)}catch{serialized="{}"}}
  return {
    importKind:"public_dataset",
    dictionaryMode,
    datasetName:metadata.sourceName,
    datasetUrl:metadata.sourceDatasetUrl,
    sourceRecordId,
    originalRecordExcerpt:serialized.slice(0,MAX_SOURCE_PAYLOAD_LENGTH),
    levelMapping,
    dictionaryVerification:{status:"pending",checkedAt:null},
    koreanMeaningSuggestion:{status:"pending",source:null},
  }
}
function prepareRows(rows:VocabularyDatasetImportRow[],defaultLexicalType:string,metadataInput:VocabularyDatasetImportMetadata){
  if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS_PER_BATCH)throw new Error("데이터는 한 번에 1~100개씩 처리할 수 있습니다.")
  if(!LEXICAL_TYPES.has(defaultLexicalType))throw new Error("기본 표현 유형을 확인해 주세요.")
  const sourceName=typeof metadataInput?.sourceName==="string"?metadataInput.sourceName.trim():""
  const sourceDatasetUrl=requireHttpsUrl(metadataInput?.sourceDatasetUrl??"","데이터 출처 주소")!
  const licenseName=typeof metadataInput?.licenseName==="string"?metadataInput.licenseName.trim().slice(0,40):""
  const licenseUrl=metadataInput?.licenseUrl?requireHttpsUrl(metadataInput.licenseUrl,"라이선스 주소",true):null
  if(!sourceName||sourceName.length>60)throw new Error("데이터 출처 이름을 입력해 주세요.")
  const metadata={sourceName,sourceDatasetUrl,licenseName,licenseUrl:licenseUrl??undefined}
  return rows.map((row,index)=>{
    if(!isRecord(row))throw new Error((index+1)+"번째 데이터 형식이 올바르지 않습니다.")
    const expression=typeof row.expression==="string"?row.expression.trim().replace(/\\s+/g," "):""
    const normalizedExpression=normalizeDictionaryExpression(expression)
    const suppliedDefinition=typeof row.definitionEn==="string"?row.definitionEn.trim():""
    const dictionaryMode=suppliedDefinition?"match_definition" as const:"lookup_by_expression" as const
    const definitionEn=suppliedDefinition||"FreeDictionaryAPI 의미 조회 대기"
    if(!normalizedExpression||normalizedExpression.length>100||definitionEn.length>8000)throw new Error((index+1)+"번째 데이터의 영어 표현이 없거나 길이가 제한을 초과했습니다.")
    const lexicalType=typeof row.lexicalType==="string"&&LEXICAL_TYPES.has(row.lexicalType)?row.lexicalType:defaultLexicalType
    const partOfSpeech=dictionaryMode==="lookup_by_expression"?"unknown":typeof row.partOfSpeech==="string"&&row.partOfSpeech.trim()?row.partOfSpeech.trim().toLowerCase().slice(0,40):"unknown"
    const cefr=typeof row.cefrLevel==="string"?row.cefrLevel.trim().toUpperCase():""
    const cefrLevel=CEFR_LEVELS.has(cefr)?cefr:null
    const frequency=typeof row.frequencyRank==="number"?row.frequencyRank:typeof row.frequencyRank==="string"&&row.frequencyRank.trim()?Number(row.frequencyRank):null
    const frequencyRank=Number.isInteger(frequency)&&frequency!==null&&frequency>0?Math.min(frequency,2147483647):null
    const exampleSentence=typeof row.exampleSentence==="string"&&row.exampleSentence.trim()?row.exampleSentence.trim().slice(0,5000):null
    const sourceEntryUrl=typeof row.sourceEntryUrl==="string"&&row.sourceEntryUrl.trim()?requireHttpsUrl(row.sourceEntryUrl,(index+1)+"번째 원문 주소",true)??sourceDatasetUrl:sourceDatasetUrl
    const sourceRecordId=typeof row.sourceRecordId==="string"&&row.sourceRecordId.trim()?row.sourceRecordId.trim().slice(0,200):null
    const levelMapping=deriveSourceLevelMapping(row.sourcePayload,cefrLevel??undefined)
    const seedKey="dictionary-seed:"+normalizedExpression
    const senseKey=createHash("sha256").update(dictionaryMode==="lookup_by_expression"?seedKey:definitionEn.toLowerCase().replace(/\\s+/g," ")).digest("hex").slice(0,24)
    return {
      expression,normalizedExpression,lexicalType,partOfSpeech,senseKey,definitionEn,
      senseOrder:dictionaryMode==="lookup_by_expression"?1:Number.isInteger(row.senseOrder)&&Number(row.senseOrder)>0?Math.min(Number(row.senseOrder),1000):1,
      learningStage:dictionaryMode==="lookup_by_expression"?"primary":row.learningStage==="additional"?"additional":"primary",
      meaningKo:null,exampleSentence,cefrLevel:cefrLevel??levelMapping.sourceSignals.cefrLevel,
      childLevel:levelMapping.childLevel,frequencyRank,difficultyVerified:false,
      verificationStatus:"pending_verification",sourceName,sourceEntryUrl,licenseName:licenseName||"Not specified",licenseUrl,
      sourcePayload:safeSourcePayload(row.sourcePayload,metadata,sourceRecordId,levelMapping,dictionaryMode),
      dictionaryFetchedAt:null,
    }
  })
}
function candidateKey(row:{normalizedExpression:string;lexicalType:string;partOfSpeech:string;senseKey:string}){
  return [row.normalizedExpression,row.lexicalType,row.partOfSpeech,row.senseKey].join("|")
}
export async function previewVocabularyDatasetImport(input:{rows:VocabularyDatasetImportRow[];defaultLexicalType:string;metadata:VocabularyDatasetImportMetadata}){
  await requireSuperAdmin()
  const prepared=prepareRows(input?.rows,input?.defaultLexicalType,input?.metadata)
  const unique=new Map(prepared.map(row=>[row.normalizedExpression+"|"+row.lexicalType,row]))
  const expressions=[...new Set(prepared.map(row=>row.normalizedExpression))]
  const existing=await db.select({
    normalizedExpression:vocabularyCandidates.normalizedExpression,
    lexicalType:vocabularyCandidates.lexicalType,
  }).from(vocabularyCandidates).where(inArray(vocabularyCandidates.normalizedExpression,expressions))
  const existingKeys=new Set(existing.map(row=>row.normalizedExpression+"|"+row.lexicalType))
  const duplicateInDatabase=[...unique.keys()].filter(key=>existingKeys.has(key)).length
  return {received:prepared.length,uniqueInBatch:unique.size,duplicateInDatabase,expectedNew:unique.size-duplicateInDatabase}
}
/** Store one seed per expression; the bounded dictionary worker expands it into verified senses. */
export async function stageVocabularyDatasetImport(input:{rows:VocabularyDatasetImportRow[];defaultLexicalType:string;metadata:VocabularyDatasetImportMetadata}){
  await requireSuperAdmin()
  const prepared=prepareRows(input?.rows,input?.defaultLexicalType,input?.metadata)
  const unique=[...new Map(prepared.map(row=>[row.normalizedExpression+"|"+row.lexicalType,row])).values()]
  const expressions=[...new Set(unique.map(row=>row.normalizedExpression))]
  const existing=await db.select({
    normalizedExpression:vocabularyCandidates.normalizedExpression,
    lexicalType:vocabularyCandidates.lexicalType,
  }).from(vocabularyCandidates).where(inArray(vocabularyCandidates.normalizedExpression,expressions))
  const existingKeys=new Set(existing.map(row=>row.normalizedExpression+"|"+row.lexicalType))
  const fresh=unique.filter(row=>!existingKeys.has(row.normalizedExpression+"|"+row.lexicalType))
  const inserted=fresh.length?await db.insert(vocabularyCandidates).values(fresh).onConflictDoNothing().returning({id:vocabularyCandidates.id}):[]
  revalidatePath("/super-admin/vocabulary")
  return {received:prepared.length,added:inserted.length,skippedAsDuplicate:prepared.length-inserted.length}
}
function normalizedDefinition(value:string){return value.toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}
function normalizedPos(value:string):string|null{
  const pos=value.toLowerCase().trim()
  if(!pos||pos==="unknown"||pos==="phrase")return null
  if(["n","noun"].includes(pos))return "noun"
  if(["v","verb"].includes(pos))return "verb"
  if(["adj","adjective"].includes(pos))return "adjective"
  if(["adv","adverb"].includes(pos))return "adverb"
  return pos
}
function matchVerifiedSense(candidate:{definitionEn:string;partOfSpeech:string},senses:DictionarySense[]){
  const source=normalizedDefinition(candidate.definitionEn)
  const pos=normalizedPos(candidate.partOfSpeech)
  const possible=senses.filter(sense=>!pos||!normalizedPos(sense.partOfSpeech)||pos===normalizedPos(sense.partOfSpeech))
  const exact=possible.find(sense=>normalizedDefinition(sense.definition)===source)
  if(exact)return {sense:exact,matchType:"exact" as const,matchScore:1}
  const sourceTokens=new Set(source.split(" ").filter(token=>token.length>2))
  let best:{sense:DictionarySense;score:number}|null=null
  for(const sense of possible){
    const apiTokens=new Set(normalizedDefinition(sense.definition).split(" ").filter(token=>token.length>2))
    if(!sourceTokens.size||!apiTokens.size)continue
    let overlap=0
    for(const token of sourceTokens)if(apiTokens.has(token))overlap++
    const coverage=overlap/Math.min(sourceTokens.size,apiTokens.size)
    const jaccard=overlap/new Set([...sourceTokens,...apiTokens]).size
    if(coverage>=0.85&&jaccard>=0.55&&(!best||jaccard>best.score))best={sense,score:jaccard}
  }
  return best?{sense:best.sense,matchType:"high_overlap" as const,matchScore:Math.round(best.score*1000)/1000}:null
}
function withPayload(value:unknown,updates:Record<string,unknown>){
  return {...(isRecord(value)?value:{}),...updates}
}

/**
 * Resumable, bounded verification: at most five distinct words per invocation
 * and a global 800/hour cache-miss budget (below FreeDictionaryAPI's published
 * limit). No large file import triggers thousands of synchronous API requests.
 */
export async function processNextVocabularyDatasetVerificationBatch(){
  await requireSuperAdmin()
  const pending=await db.select({
    id:vocabularyCandidates.id,expression:vocabularyCandidates.expression,
    normalizedExpression:vocabularyCandidates.normalizedExpression,
    lexicalType:vocabularyCandidates.lexicalType,partOfSpeech:vocabularyCandidates.partOfSpeech,
    definitionEn:vocabularyCandidates.definitionEn,exampleSentence:vocabularyCandidates.exampleSentence,
    senseOrder:vocabularyCandidates.senseOrder,learningStage:vocabularyCandidates.learningStage,
    childLevel:vocabularyCandidates.childLevel,cefrLevel:vocabularyCandidates.cefrLevel,
    frequencyRank:vocabularyCandidates.frequencyRank,sourceName:vocabularyCandidates.sourceName,
    sourceEntryUrl:vocabularyCandidates.sourceEntryUrl,licenseName:vocabularyCandidates.licenseName,
    licenseUrl:vocabularyCandidates.licenseUrl,sourcePayload:vocabularyCandidates.sourcePayload,
  }).from(vocabularyCandidates)
    .where(inArray(vocabularyCandidates.verificationStatus,["pending_verification","verification_retry"]))
    .orderBy(asc(vocabularyCandidates.createdAt)).limit(MAX_DICTIONARY_BATCH)
  if(!pending.length)return {processed:0,matched:0,notFound:0,mismatched:0,retry:0,hasMore:false}
  const groups=new Map<string,typeof pending>()
  for(const candidate of pending){
    const group=groups.get(candidate.normalizedExpression)??[]
    group.push(candidate);groups.set(candidate.normalizedExpression,group)
  }
  const lookupResults=new Map<string,Awaited<ReturnType<typeof lookupFreeDictionaryCached>>>()
  await Promise.all([...groups.keys()].map(async expression=>{
    const result=await lookupFreeDictionaryCached(expression,{key:"global",action:"free-dictionary-bulk",limit:800,windowSeconds:3600})
    lookupResults.set(expression,result)
  }))
  let matched=0,notFound=0,mismatched=0,retry=0
  for(const [expression,candidates] of groups){
    const lookup=lookupResults.get(expression)
    if(!lookup||lookup.status==="unavailable"){
      retry+=candidates.length
      for(const candidate of candidates)await db.update(vocabularyCandidates).set({
        verificationStatus:"verification_retry",
        sourcePayload:withPayload(candidate.sourcePayload,{dictionaryVerification:{status:"unavailable",reason:lookup?.status==="unavailable"?lookup.reason:"upstream_error",checkedAt:new Date().toISOString()}}),
        updatedAt:new Date(),
      }).where(eq(vocabularyCandidates.id,candidate.id))
      continue
    }
    if(lookup.status==="not_found"){
      notFound+=candidates.length
      for(const candidate of candidates)await db.update(vocabularyCandidates).set({
        verificationStatus:"dictionary_not_found",
        definitionEn:"FreeDictionaryAPI에서 표제어를 찾지 못했습니다.",
        sourcePayload:withPayload(candidate.sourcePayload,{dictionaryVerification:{status:"not_found",checkedAt:new Date().toISOString()}}),
        updatedAt:new Date(),
      }).where(eq(vocabularyCandidates.id,candidate.id))
      continue
    }
    for(const candidate of candidates){
      const payload=isRecord(candidate.sourcePayload)?candidate.sourcePayload:{}
      const dictionaryMode=payload.dictionaryMode==="lookup_by_expression"
      if(dictionaryMode){
        const uniqueSenses=[...new Map(lookup.senses
          .filter(sense=>typeof sense.definition==="string"&&sense.definition.trim())
          .map(sense=>[sense.partOfSpeech.toLowerCase()+"|"+normalizedDefinition(sense.definition),sense])).values()]
          .slice(0,20)
        if(!uniqueSenses.length){
          mismatched++
          await db.update(vocabularyCandidates).set({
            verificationStatus:"dictionary_mismatch",
            definitionEn:"FreeDictionaryAPI에서 사용할 수 있는 정의를 찾지 못했습니다.",
            sourcePayload:withPayload(payload,{dictionaryVerification:{status:"mismatch",reason:"사전에서 사용할 수 있는 정의가 없습니다.",sourceUrl:lookup.sourceUrl,checkedAt:new Date().toISOString()}}),
            updatedAt:new Date(),
          }).where(eq(vocabularyCandidates.id,candidate.id))
          continue
        }
        const now=new Date()
        for(let index=0;index<uniqueSenses.length;index++){
          const sense=uniqueSenses[index]
          const partOfSpeech=sense.partOfSpeech.trim().toLowerCase()||"unknown"
          const definitionEn=sense.definition.trim()
          const senseKey=createHash("sha256").update(partOfSpeech+"|"+normalizedDefinition(definitionEn)).digest("hex").slice(0,24)
          const korean=[...new Set(sense.translations.filter(item=>item.languageCode==="ko").map(item=>item.word.trim()).filter(Boolean))].slice(0,3)
          let meaningKo=korean.join(" / ").slice(0,200)||null
          const meaningSuggestion:Record<string,unknown>=meaningKo
            ?{status:"dictionary_translation",sourceName:"FreeDictionaryAPI.com",languageCode:"ko",values:korean}
            :{status:"pending_ai_draft",sourceName:"Gemini",basedOn:"FreeDictionaryAPI dictionary sense"}
          if(!meaningKo){
            try{
              meaningKo=await generateKoreanMeaningDraft({expression:candidate.expression,partOfSpeech,verifiedDefinitionEn:definitionEn})
            }catch{
              meaningKo=null
            }
            meaningSuggestion.status=meaningKo?"ai_draft":"unavailable"
            meaningSuggestion.requiresHumanReview=true
          }
          const dictionaryVerification={
            status:"matched",matchType:"dictionary_lookup",senseCount:uniqueSenses.length,senseOrder:index+1,
            partOfSpeech,definitionEn,examples:sense.examples,translations:sense.translations,
            sourceUrl:lookup.sourceUrl,licenseName:lookup.licenseName,licenseUrl:lookup.licenseUrl,
            verifiedAt:now.toISOString(),
          }
          const nextPayload=withPayload(payload,{dictionaryVerification,koreanMeaningSuggestion:meaningSuggestion})
          const common={
            senseKey,expression:candidate.expression,normalizedExpression:candidate.normalizedExpression,
            lexicalType:candidate.lexicalType,partOfSpeech,definitionEn,meaningKo,
            senseOrder:index+1,learningStage:index===0?"primary" as const:"additional" as const,
            exampleSentence:sense.examples[0]??null,childLevel:candidate.childLevel,cefrLevel:candidate.cefrLevel,
            frequencyRank:candidate.frequencyRank,difficultyVerified:false,verificationStatus:"dictionary_found",
            sourceName:"FreeDictionaryAPI.com",sourceEntryUrl:lookup.sourceUrl,
            licenseName:lookup.licenseName,licenseUrl:lookup.licenseUrl,sourcePayload:nextPayload,
            dictionaryFetchedAt:now,updatedAt:now,
          }
          if(index===0){
            await db.update(vocabularyCandidates).set(common).where(eq(vocabularyCandidates.id,candidate.id))
          }else{
            await db.insert(vocabularyCandidates).values(common).onConflictDoNothing()
          }
        }
        matched++
        continue
      }

      const match=matchVerifiedSense(candidate,lookup.senses)
      if(!match){
        mismatched++
        await db.update(vocabularyCandidates).set({
          verificationStatus:"dictionary_mismatch",
          sourcePayload:withPayload(candidate.sourcePayload,{dictionaryVerification:{
            status:"mismatch",reason:"FreeDictionaryAPI에서 같은 품사와 의미의 정의를 확인하지 못했습니다.",
            sourceUrl:lookup.sourceUrl,licenseName:lookup.licenseName,licenseUrl:lookup.licenseUrl,checkedAt:new Date().toISOString(),
          }}),
          updatedAt:new Date(),
        }).where(eq(vocabularyCandidates.id,candidate.id))
        continue
      }
      const korean=[...new Set(match.sense.translations.filter(item=>item.languageCode==="ko").map(item=>item.word.trim()).filter(Boolean))].slice(0,3)
      let meaningKo=korean.join(" / ").slice(0,200)||null
      const meaningSuggestion:Record<string,unknown>=meaningKo
        ?{status:"dictionary_translation",sourceName:"FreeDictionaryAPI.com",languageCode:"ko",values:korean}
        :{status:"pending_ai_draft",sourceName:"Gemini",basedOn:"FreeDictionaryAPI verified sense"}
      if(!meaningKo){
        meaningKo=await generateKoreanMeaningDraft({expression:candidate.expression,partOfSpeech:match.sense.partOfSpeech,verifiedDefinitionEn:match.sense.definition})
        meaningSuggestion.status=meaningKo?"ai_draft":"unavailable"
        meaningSuggestion.requiresHumanReview=true
      }
      const dictionaryVerification={
        status:"matched",matchType:match.matchType,matchScore:match.matchScore,
        partOfSpeech:match.sense.partOfSpeech,definitionEn:match.sense.definition,
        examples:match.sense.examples,translations:match.sense.translations,
        sourceUrl:lookup.sourceUrl,licenseName:lookup.licenseName,licenseUrl:lookup.licenseUrl,
        verifiedAt:new Date().toISOString(),
      }
      matched++
      await db.update(vocabularyCandidates).set({
        verificationStatus:"dictionary_found",definitionEn:match.sense.definition,
        partOfSpeech:match.sense.partOfSpeech||candidate.partOfSpeech,
        exampleSentence:candidate.exampleSentence||match.sense.examples[0]||null,
        meaningKo,
        sourcePayload:withPayload(candidate.sourcePayload,{dictionaryVerification,koreanMeaningSuggestion:meaningSuggestion}),
        dictionaryFetchedAt:new Date(),updatedAt:new Date(),
      }).where(eq(vocabularyCandidates.id,candidate.id))
    }
  }
  revalidatePath("/super-admin/vocabulary")
  return {processed:pending.length,matched,notFound,mismatched,retry,hasMore:pending.length===MAX_DICTIONARY_BATCH}
}

export async function retryVocabularyCandidateVerification(candidateId:string){
  await requireSuperAdmin()
  const [candidate]=await db.select({id:vocabularyCandidates.id,verificationStatus:vocabularyCandidates.verificationStatus})
    .from(vocabularyCandidates).where(eq(vocabularyCandidates.id,candidateId)).limit(1)
  if(!candidate||!["dictionary_not_found","dictionary_mismatch","verification_retry"].includes(candidate.verificationStatus))
    throw new Error("다시 검증할 수 있는 어휘 후보가 아닙니다.")
  await db.update(vocabularyCandidates).set({verificationStatus:"verification_retry",updatedAt:new Date()})
    .where(eq(vocabularyCandidates.id,candidate.id))
  revalidatePath("/super-admin/vocabulary")
  return {success:true}
}

export async function regenerateVocabularyCandidateKoreanMeaning(candidateId:string){
  await requireSuperAdmin()
  const [candidate]=await db.select({
    id:vocabularyCandidates.id,expression:vocabularyCandidates.expression,
    partOfSpeech:vocabularyCandidates.partOfSpeech,sourcePayload:vocabularyCandidates.sourcePayload,
    verificationStatus:vocabularyCandidates.verificationStatus,
  }).from(vocabularyCandidates).where(eq(vocabularyCandidates.id,candidateId)).limit(1)
  if(!candidate||candidate.verificationStatus!=="dictionary_found"||!isRecord(candidate.sourcePayload))
    throw new Error("사전 검증이 완료된 후보를 찾을 수 없습니다.")
  const verification=candidate.sourcePayload.dictionaryVerification
  if(!isRecord(verification)||verification.status!=="matched"||typeof verification.definitionEn!=="string")
    throw new Error("FreeDictionaryAPI 의미 검증이 완료되지 않았습니다.")
  const meaningKo=await generateKoreanMeaningDraft({
    expression:candidate.expression,partOfSpeech:candidate.partOfSpeech,verifiedDefinitionEn:verification.definitionEn,
  })
  if(!meaningKo)throw new Error("AI 뜻 제안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.")
  await db.update(vocabularyCandidates).set({
    meaningKo,
    sourcePayload:withPayload(candidate.sourcePayload,{koreanMeaningSuggestion:{
      status:"ai_draft",sourceName:"Gemini",basedOn:"FreeDictionaryAPI verified sense",requiresHumanReview:true,
    }}),
    updatedAt:new Date(),
  }).where(eq(vocabularyCandidates.id,candidate.id))
  revalidatePath("/super-admin/vocabulary")
  return {success:true,meaningKo}
}
