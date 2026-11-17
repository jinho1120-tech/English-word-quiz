"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Languages, RefreshCw, ShieldCheck, X } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { reviewVocabularyCandidate } from "@/app/actions/ai-vocabulary"
import {
  processNextVocabularyDatasetVerificationBatch,
  regenerateVocabularyCandidateKoreanMeaning,
  retryVocabularyCandidateVerification,
} from "@/app/actions/vocabulary-dataset-import"

type Candidate = {
  id:string;expression:string;senseOrder:number;learningStage:"primary"|"additional";lexicalType:string;disambiguation:string|null;partOfSpeech:string
  definitionEn:string;meaningKo:string|null;childLevel:string|null;cefrLevel:string|null;domain:string|null
  exampleSentence:string|null;sourceName:string;sourceEntryUrl:string|null;licenseName:string;licenseUrl:string|null
  sourcePayload:Record<string,unknown>;verificationStatus:string;createdAt:Date
}
const LEVELS=[
  {value:"L1",label:"L1 입문"},{value:"L2",label:"L2 초급"},{value:"L3",label:"L3 초중급"},
  {value:"L4",label:"L4 중급"},{value:"L5",label:"L5 중상급"},{value:"L6",label:"L6 고급"},
]
const CEFR=["A1","A2","B1","B2","C1","C2"]
const DOMAINS=[
  {value:"general",label:"일반 영어"},{value:"advanced",label:"고급 영어"},{value:"business",label:"비즈니스"},
  {value:"academic",label:"학술"},{value:"professional",label:"전문 분야"},{value:"medical",label:"의학"},
  {value:"biology",label:"생물학"},{value:"chemistry",label:"화학"},{value:"engineering",label:"공학"},{value:"law",label:"법률"},
]
const TYPE_LABELS:Record<string,string>={word:"단어",idiom:"숙어",phrasal_verb:"구동사",collocation:"연어"}
const STATUS_LABELS:Record<string,string>={
  pending_verification:"사전 검증 대기",verification_retry:"재검증 대기",dictionary_found:"사전 검증 완료",
  dictionary_not_found:"사전 항목 없음",dictionary_mismatch:"품사·뜻 불일치",
}
function asRecord(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}
}
function CandidateCard({candidate,onReviewed}:{candidate:Candidate;onReviewed:(id:string)=>void}){
  const router=useRouter()
  const payload=asRecord(candidate.sourcePayload)
  const levelMapping=asRecord(payload.levelMapping)
  const signals=asRecord(levelMapping.sourceSignals)
  const verification=asRecord(payload.dictionaryVerification)
  const meaningSuggestion=asRecord(payload.koreanMeaningSuggestion)
  const isDataset=payload.importKind==="public_dataset"
  const dictionaryMatched=verification.status==="matched"
  const levelMapped=levelMapping.status==="mapped"
  const canApprove=!isDataset||(dictionaryMatched&&levelMapped&&candidate.verificationStatus==="dictionary_found")
  const [meaningKo,setMeaningKo]=useState(candidate.meaningKo??"")
  const [learningStage,setLearningStage]=useState<"primary"|"additional">(candidate.learningStage??"primary")
  const [disambiguation,setDisambiguation]=useState(candidate.disambiguation??"")
  const [childLevel,setChildLevel]=useState(candidate.childLevel??(typeof levelMapping.childLevel==="string"?levelMapping.childLevel:""))
  const [cefrLevel,setCefrLevel]=useState(candidate.cefrLevel??"")
  const [domain,setDomain]=useState(candidate.domain??"general")
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [isPending,startTransition]=useTransition()
  useEffect(()=>{
    setMeaningKo(candidate.meaningKo??"")
    setChildLevel(candidate.childLevel??(typeof levelMapping.childLevel==="string"?levelMapping.childLevel:""))
  },[candidate.meaningKo,candidate.childLevel,levelMapping.childLevel])

  function review(decision:"approve"|"reject"){
    setError("");setNotice("")
    startTransition(async()=>{
      try{
        await reviewVocabularyCandidate({candidateId:candidate.id,decision,meaningKo,disambiguation,childLevel,cefrLevel,domain,learningStage,difficultyVerified:true})
        onReviewed(candidate.id)
      }catch(cause){setError(cause instanceof Error?cause.message:"후보를 검토하지 못했어요.")}
    })
  }
  function retryMeaning(){
    setError("");setNotice("")
    startTransition(async()=>{
      try{
        const result=await regenerateVocabularyCandidateKoreanMeaning(candidate.id)
        setMeaningKo(result.meaningKo)
        setNotice("검증된 영어 사전 정의를 바탕으로 한국어 뜻 초안을 다시 만들었습니다.")
        router.refresh()
      }catch(cause){setError(cause instanceof Error?cause.message:"한국어 뜻을 다시 제안하지 못했어요.")}
    })
  }
  function retryDictionary(){
    setError("")
    startTransition(async()=>{
      try{await retryVocabularyCandidateVerification(candidate.id);router.refresh()}
      catch(cause){setError(cause instanceof Error?cause.message:"사전 재검증을 요청하지 못했어요.")}
    })
  }
  const signalLabels=[
    typeof signals.gradeLevel==="number"?"원본 학년 "+signals.gradeLevel:null,
    typeof signals.gradeLevelEstimate==="number"?"학년 추정 "+signals.gradeLevelEstimate:null,
    signals.gradeBand&&typeof signals.gradeBand==="object"?"학년 범위 "+String(asRecord(signals.gradeBand).min)+"–"+String(asRecord(signals.gradeBand).max):null,
    typeof signals.cefrLevel==="string"?"CEFR "+signals.cefrLevel:null,
    typeof signals.yleLevel==="string"?"YLE "+signals.yleLevel:null,
    typeof signals.frequencyBand==="number"?"빈도군 "+signals.frequencyBand:null,
  ].filter(Boolean)
  return(
    <article className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-base font-bold">{candidate.expression}</h3><p className="text-xs text-muted-foreground">{TYPE_LABELS[candidate.lexicalType]??candidate.lexicalType} · {candidate.partOfSpeech} · 원본 의미 순서 {candidate.senseOrder}번째</p></div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">{STATUS_LABELS[candidate.verificationStatus]??candidate.verificationStatus}</span>
      </div>
      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
        <p className="text-sm leading-relaxed">{candidate.definitionEn}</p>
        {candidate.exampleSentence&&<p className="text-xs italic leading-relaxed text-muted-foreground">“{candidate.exampleSentence}”</p>}
        <p className="text-[11px] text-muted-foreground">
          데이터 출처: {candidate.sourceName} · {candidate.licenseName}
          {candidate.sourceEntryUrl&&<> · <a href={candidate.sourceEntryUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">원문 보기</a></>}
          {candidate.licenseUrl&&<> · <a href={candidate.licenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">라이선스</a></>}
        </p>
      </div>
      {isDataset&&(
        <div className="space-y-1 rounded-xl border border-border p-3 text-xs">
          <p className="font-semibold">FreeDictionaryAPI 영어 의미·품사 대조</p>
          {dictionaryMatched?<>
            <p>일치 상태: {verification.matchType==="exact"?"정의 일치":"정의 내용 강한 유사"} · 일치도 {(Number(verification.matchScore??0)*100).toFixed(0)}%</p>
            {typeof verification.sourceUrl==="string"&&<p>검증 사전: <a href={verification.sourceUrl} target="_blank" rel="noreferrer" className="underline">FreeDictionaryAPI / Wiktionary 원문</a> · {String(verification.licenseName??"CC BY-SA 4.0")}</p>}
          </>:<p className="text-muted-foreground">같은 품사와 의미의 사전 항목을 아직 확인하지 못했습니다. 검증이 완료될 때까지 승인할 수 없습니다.</p>}
          {levelMapped?<p>원본 레벨 신호: {signalLabels.length?signalLabels.join(" · "):"원본 레벨 데이터"}<br/>변환: <strong>{String(levelMapping.childLevel)}</strong> · {String(levelMapping.rule??"")}</p>
          :<p className="text-muted-foreground">원본 레벨 데이터가 부족해 L1~L6을 지정하지 않았습니다. 이 항목은 현재 승인할 수 없습니다.</p>}
        </div>
      )}
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">학습 단계</span><select value={learningStage} onChange={event=>setLearningStage(event.target.value as "primary"|"additional")} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="primary">대표 의미 · 초기 학습</option><option value="additional">추가 의미 · 후속 학습</option></select><span className="block text-[11px] text-muted-foreground">원본에서 먼저 나온 뜻을 대표 의미로 제안합니다. 원본 순서는 실제 사용 빈도 순위가 아니므로 필요하면 여기서 변경해 주세요.</span></label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">한국어 뜻 제안</span>
        <input value={meaningKo} onChange={event=>setMeaningKo(event.target.value)} maxLength={200} placeholder="검증된 의미에 대한 한국어 뜻" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"/>
        <span className="block text-[11px] text-muted-foreground">
          {meaningSuggestion.status==="dictionary_translation"?"FreeDictionaryAPI 제공 한국어 번역":
           meaningSuggestion.status==="ai_draft"?"Gemini 초안 · 사전 검증 정의 기반 · 관리자 확인 필요":
           meaningSuggestion.status==="unavailable"?"한국어 뜻 제안 생성 실패 · 다시 시도할 수 있습니다":"한국어 뜻 출처 미확인"}
        </span>
        {isDataset&&dictionaryMatched&&meaningSuggestion.status==="unavailable"&&
          <HapticButton type="button" disabled={isPending} onClick={retryMeaning} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw className="size-3.5"/>한국어 뜻 다시 생성</HapticButton>}
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">뜻 구분 설명 (선택)</span>
        <input value={disambiguation} onChange={event=>setDisambiguation(event.target.value)} maxLength={100} placeholder="예: 불에 / 탈것을" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"/>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">서비스 난이도</span>
          <select value={childLevel} onChange={event=>setChildLevel(event.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2.5 text-sm">
            <option value="">미지정</option>{LEVELS.map(level=><option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">성인 CEFR</span>
          <select value={cefrLevel} onChange={event=>setCefrLevel(event.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2.5 text-sm">
            <option value="">선택 안 함</option>{CEFR.map(level=><option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">분야</span>
        <select value={domain} onChange={event=>setDomain(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
          {DOMAINS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <HapticButton type="button" disabled={isPending||!meaningKo.trim()||!childLevel||!canApprove} onClick={()=>review("approve")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Check className="size-4"/>검토 승인</HapticButton>
        <HapticButton type="button" disabled={isPending} onClick={()=>review("reject")} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-50"><X className="size-4"/>후보 제외</HapticButton>
      </div>
      {isDataset&&["dictionary_not_found","dictionary_mismatch"].includes(candidate.verificationStatus)&&
        <HapticButton type="button" disabled={isPending} onClick={retryDictionary} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw className="size-3.5"/>사전 재검증 요청</HapticButton>}
      {!canApprove&&<p className="text-xs text-muted-foreground">외부 데이터는 사전 검증과 원본 레벨 변환이 완료되어야 승인할 수 있습니다.</p>}
      {error&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    </article>
  )
}

export function VocabularyCandidateReview({candidates,candidatePage,candidatePageCount}:{candidates:Candidate[];candidatePage:number;candidatePageCount:number}){
  const router=useRouter()
  const [items,setItems]=useState(candidates)
  const [showAll,setShowAll]=useState(false)
  const [progress,setProgress]=useState("")
  const [notice,setNotice]=useState("")
  const [error,setError]=useState("")
  const [isPending,startTransition]=useTransition()
  useEffect(()=>setItems(candidates),[candidates])
  function verifyNextBatch(){
    setError("");setNotice("")
    startTransition(async()=>{
      try{
        setProgress("최대 5개 표현의 사전 검증 및 뜻 제안 중…")
        const result=await processNextVocabularyDatasetVerificationBatch()
        setNotice(`처리 ${result.processed}개 · 검증 통과 ${result.matched}개 · 사전 미검색 ${result.notFound}개 · 뜻/품사 불일치 ${result.mismatched}개 · 재시도 ${result.retry}개`)
        router.refresh()
      }catch(cause){setError(cause instanceof Error?cause.message:"사전 검증을 완료하지 못했어요.")}
      finally{setProgress("")}
    })
  }
  if(!items.length)return(
    <section id="candidate-review" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">어휘 후보 검토</h2>
      <p className="text-sm text-muted-foreground">이 페이지에 검토할 후보가 없어요. 위에서 데이터셋 또는 사전 조회로 후보를 등록할 수 있어요.</p>
      <HapticButton type="button" disabled={isPending} onClick={verifyNextBatch} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"><ShieldCheck className="size-4"/>{isPending?(progress||"검증 중…"):"다음 5개 사전 검증 및 뜻 제안"}</HapticButton>
      {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      {candidatePageCount>1&&<div className="flex items-center justify-between text-sm"><Link href={`?candidatePage=${Math.max(1,candidatePage-1)}#candidate-review`} className="rounded-lg border border-border px-3 py-2">이전</Link><span className="text-muted-foreground">{candidatePage} / {candidatePageCount}</span><Link href={`?candidatePage=${Math.min(candidatePageCount,candidatePage+1)}#candidate-review`} className="rounded-lg border border-border px-3 py-2">다음</Link></div>}
    </section>
  )
  const visible=showAll?items:items.slice(0,5)
  return(
    <section id="candidate-review" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Languages className="size-5"/>어휘 후보 검토</h2>
        <p className="mt-1 text-sm text-muted-foreground">먼저 사전 검증을 실행하면 한국어 뜻과 원본 데이터 기반 L1~L6 제안이 표시됩니다. 대표 의미는 초기 학습에 사용하고, 추가 의미는 후속 학습용으로 보존합니다.</p>
        <p className="mt-1 text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline size-3.5"/>Gemini 한국어 뜻은 초안으로 표시되고, 레벨은 원본 학년·CEFR·YLE·빈도 신호의 고정 규칙으로만 변환합니다.</p>
      </div>
      <HapticButton type="button" disabled={isPending} onClick={verifyNextBatch} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"><ShieldCheck className="size-4"/>{isPending?(progress||"검증 중…"):"다음 5개 사전 검증 및 뜻 제안"}</HapticButton>
      {notice&&<p role="status" className="rounded-lg bg-muted/50 p-3 text-xs">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {visible.map(candidate=><CandidateCard key={candidate.id} candidate={candidate} onReviewed={id=>setItems(current=>current.filter(item=>item.id!==id))}/>)}
      {items.length>5&&<button type="button" onClick={()=>setShowAll(value=>!value)} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground">{showAll?"접기":`나머지 ${items.length-5}개 더 보기`}</button>}
      {candidatePageCount>1&&<div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm"><Link href={`?candidatePage=${Math.max(1,candidatePage-1)}#candidate-review`} aria-disabled={candidatePage<=1} className={`rounded-lg border border-border px-3 py-2 ${candidatePage<=1?"pointer-events-none opacity-40":""}`}>이전</Link><span className="text-muted-foreground">{candidatePage} / {candidatePageCount} 페이지</span><Link href={`?candidatePage=${Math.min(candidatePageCount,candidatePage+1)}#candidate-review`} aria-disabled={candidatePage>=candidatePageCount} className={`rounded-lg border border-border px-3 py-2 ${candidatePage>=candidatePageCount?"pointer-events-none opacity-40":""}`}>다음</Link></div>}
    </section>
  )
}
