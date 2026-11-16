import { handleSchedule } from "@vercel/schedules"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { aiVocabularySettings } from "@/lib/db/schema"
import { generateAiVocabularyBundleForChild } from "@/lib/ai-vocabulary-engine"

export const runtime = "nodejs"

/**
 * Private Vercel Schedules handler.
 * handleSchedule validates the signed schedule dispatch before running the job.
 */
export const POST = handleSchedule(async (metadata) => {
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
  console.info("[ai-vocabulary-schedule]", JSON.stringify({
    schedule: metadata.name,
    scheduledAt: metadata.scheduledAt.toISOString(),
    processed: results.length,
    failed: results.filter((item) => item.status === "error").length,
  }))
})
