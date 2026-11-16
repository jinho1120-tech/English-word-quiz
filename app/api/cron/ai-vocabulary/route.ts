import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { aiVocabularySettings } from "@/lib/db/schema"
import { generateAiVocabularyBundleForChild } from "@/lib/ai-vocabulary-engine"

export const runtime = "nodejs"

/**
 * Private Vercel Schedule target.
 * The schedule/v1beta trigger makes this function callable only by Vercel's
 * scheduling infrastructure. Never add a public GET/POST route for this task.
 */
export async function POST() {
  const enabledChildren = await db.select({
    childProfileId: aiVocabularySettings.childProfileId,
  }).from(aiVocabularySettings)
    .where(eq(aiVocabularySettings.enabled, true))

  const results: { childProfileId: string; status: string; [key: string]: unknown }[] = []
  for (const child of enabledChildren) {
    try {
      const result = await generateAiVocabularyBundleForChild(child.childProfileId)
      results.push({ childProfileId: child.childProfileId, ...result })
    } catch (error) {
      results.push({
        childProfileId: child.childProfileId,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown scheduled recommendation error",
      })
    }
  }

  revalidatePath("/parent")
  revalidatePath("/child")
  return NextResponse.json({
    success: results.every((item) => item.status !== "error"),
    processed: results.length,
    results,
  })
}
