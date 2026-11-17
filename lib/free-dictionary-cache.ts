import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { dictionaryLookupCache } from "@/lib/db/schema"
import { getClientRateLimitKey } from "@/lib/client-ip"
import { consumeRateLimit } from "@/lib/rate-limit"
import { lookupFreeDictionary, normalizeDictionaryExpression, type DictionaryLookupResult } from "@/lib/free-dictionary-api"

type LookupRateLimitOptions={key?:string;action?:string;limit?:number;windowSeconds?:number}
function isCachedDictionaryPayload(value:unknown):value is {
  word:string
  senses:{partOfSpeech:string;definition:string;examples:string[];translations:{languageCode:string;languageName:string;word:string}[]}[]
  sourceUrl:string;licenseName:string;licenseUrl:string
}{
  if(!value||typeof value!=="object") return false
  const row=value as Record<string,unknown>
  return typeof row.word==="string"&&typeof row.sourceUrl==="string"&&typeof row.licenseName==="string"&&
    typeof row.licenseUrl==="string"&&Array.isArray(row.senses)&&row.senses.every((sense)=>{
      if(!sense||typeof sense!=="object") return false
      const item=sense as Record<string,unknown>
      return typeof item.partOfSpeech==="string"&&typeof item.definition==="string"&&
        Array.isArray(item.examples)&&item.examples.every((v)=>typeof v==="string")&&
        Array.isArray(item.translations)&&item.translations.every((v)=>{
          if(!v||typeof v!=="object") return false
          const t=v as Record<string,unknown>
          return typeof t.languageCode==="string"&&typeof t.languageName==="string"&&typeof t.word==="string"
        })
    })
}

export async function lookupFreeDictionaryCached(expression:string,options:LookupRateLimitOptions={}):Promise<DictionaryLookupResult>{
  const normalizedExpression=normalizeDictionaryExpression(expression)
  const [cached]=await db.select().from(dictionaryLookupCache)
    .where(eq(dictionaryLookupCache.normalizedExpression,normalizedExpression)).limit(1)
  const now=new Date()
  if(cached&&cached.expiresAt>now){
    if(cached.lookupStatus==="not_found") return {status:"not_found",word:normalizedExpression}
    // Old cache entries without per-sense translations are refreshed automatically.
    if(cached.lookupStatus==="found"&&isCachedDictionaryPayload(cached.responsePayload)){
      return {
        status:"found",word:cached.responsePayload.word,senses:cached.responsePayload.senses,
        sourceUrl:cached.responsePayload.sourceUrl,licenseName:cached.responsePayload.licenseName,
        licenseUrl:cached.responsePayload.licenseUrl,payload:cached.responsePayload as Record<string,unknown>,
      }
    }
  }
  const rateLimitKey=options.key?{key:options.key}:await getClientRateLimitKey()
  const budget=await consumeRateLimit(rateLimitKey.key,options.action??"free-dictionary-api",options.limit??45,options.windowSeconds??3600)
  if(!budget.allowed) return {status:"unavailable",word:normalizedExpression,reason:"rate_limited"}
  // The upstream provider limit applies to our server egress, not just one admin.
  const providerBudget=await consumeRateLimit("global","free-dictionary-provider",850,3600)
  if(!providerBudget.allowed) return {status:"unavailable",word:normalizedExpression,reason:"rate_limited"}
  const result=await lookupFreeDictionary(normalizedExpression)
  if(result.status==="unavailable") return result
  const expiresAt=new Date(now.getTime()+(result.status==="found"?30:1)*24*60*60*1000)
  const responsePayload=result.status==="found"?{
    word:result.word,senses:result.senses,sourceUrl:result.sourceUrl,licenseName:result.licenseName,licenseUrl:result.licenseUrl,
  }:{}
  await db.insert(dictionaryLookupCache).values({
    normalizedExpression,lookupStatus:result.status,responsePayload,
    sourceUrl:result.status==="found"?result.sourceUrl:null,
    licenseName:result.status==="found"?result.licenseName:"CC BY-SA 4.0",
    licenseUrl:result.status==="found"?result.licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/",
    checkedAt:now,expiresAt,updatedAt:now,
  }).onConflictDoUpdate({
    target:dictionaryLookupCache.normalizedExpression,
    set:{
      lookupStatus:result.status,responsePayload,
      sourceUrl:result.status==="found"?result.sourceUrl:null,
      licenseName:result.status==="found"?result.licenseName:"CC BY-SA 4.0",
      licenseUrl:result.status==="found"?result.licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/",
      checkedAt:now,expiresAt,updatedAt:now,
    },
  })
  return result
}
