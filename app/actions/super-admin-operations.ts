"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/super-admin"

const PROVIDERS = new Set(["gemini", "azure_speech"])
const BILLING_PROVIDERS = new Set(["gemini", "azure_speech", "vercel", "neon"])

function readProvider(value: FormDataEntryValue | null, allowed: Set<string>) {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error("서비스 항목이 올바르지 않습니다.")
  return value
}

function readOptionalFamilyId(formData: FormData) {
  const value = formData.get("familyId")
  if (value === null || value === "") return null
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("가족 정보가 올바르지 않습니다.")
  return value
}

function addSystemAudit(
  client: Awaited<ReturnType<typeof pool.connect>>,
  actor: { id: string; email: string },
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>,
) {
  return client.query(
    `INSERT INTO super_admin_system_audit_logs
      (actor_user_id, actor_email, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor.id, actor.email, action, targetType, targetId, JSON.stringify(details)],
  )
}

export async function saveServiceUsageLimit(formData: FormData) {
  const actor = await requireSuperAdmin()
  const provider = readProvider(formData.get("provider"), PROVIDERS)
  const familyId = readOptionalFamilyId(formData)
  const rawLimit = formData.get("monthlyRequestLimit")
  let limit: number | null = null
  if (rawLimit !== null && rawLimit !== "") {
    if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) throw new Error("월간 요청 한도는 0 이상의 정수로 입력해 주세요.")
    limit = Number(rawLimit)
    if (!Number.isSafeInteger(limit) || limit > 100000000) throw new Error("월간 요청 한도가 너무 큽니다.")
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    if (familyId) {
      const exists = await client.query("SELECT 1 FROM families WHERE id = $1 LIMIT 1", [familyId])
      if (!exists.rowCount) throw new Error("선택한 가족을 찾을 수 없습니다.")
    }

    if (limit === null) {
      if (familyId) {
        await client.query("DELETE FROM service_usage_limits WHERE provider = $1 AND family_id = $2", [provider, familyId])
      } else {
        await client.query("DELETE FROM service_usage_limits WHERE provider = $1 AND family_id IS NULL", [provider])
      }
    } else if (familyId) {
      await client.query(
        `INSERT INTO service_usage_limits
          (provider, family_id, monthly_request_limit, enabled, updated_by_user_id, updated_by_email, updated_at)
         VALUES ($1, $2, $3, true, $4, $5, now())
         ON CONFLICT (provider, family_id) WHERE family_id IS NOT NULL
         DO UPDATE SET monthly_request_limit = EXCLUDED.monthly_request_limit,
                       enabled = true,
                       updated_by_user_id = EXCLUDED.updated_by_user_id,
                       updated_by_email = EXCLUDED.updated_by_email,
                       updated_at = now()`,
        [provider, familyId, limit, actor.id, actor.email],
      )
    } else {
      await client.query(
        `INSERT INTO service_usage_limits
          (provider, family_id, monthly_request_limit, enabled, updated_by_user_id, updated_by_email, updated_at)
         VALUES ($1, NULL, $2, true, $3, $4, now())
         ON CONFLICT (provider) WHERE family_id IS NULL
         DO UPDATE SET monthly_request_limit = EXCLUDED.monthly_request_limit,
                       enabled = true,
                       updated_by_user_id = EXCLUDED.updated_by_user_id,
                       updated_by_email = EXCLUDED.updated_by_email,
                       updated_at = now()`,
        [provider, limit, actor.id, actor.email],
      )
    }

    await addSystemAudit(client, actor, "service_usage_limit_updated", familyId ? "family" : "service", familyId ?? provider, {
      provider,
      familyId,
      monthlyRequestLimit: limit,
      enabled: limit !== null,
    })
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  revalidatePath("/super-admin/limits")
  revalidatePath("/super-admin/overview")
  redirect("/super-admin/limits?saved=1")
}

export async function saveProviderMonthlyCost(formData: FormData) {
  const actor = await requireSuperAdmin()
  const provider = readProvider(formData.get("provider"), BILLING_PROVIDERS)
  const month = formData.get("month")
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("청구 월을 확인해 주세요.")
  const amountValue = formData.get("amount")
  if (typeof amountValue !== "string" || amountValue.trim() === "") throw new Error("청구 금액을 입력해 주세요.")
  const amount = Number(amountValue)
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999999999) throw new Error("청구 금액은 0 이상의 유효한 숫자여야 합니다.")
  const currencyValue = formData.get("currency")
  const currency = currencyValue === "USD" ? "USD" : currencyValue === "KRW" ? "KRW" : null
  if (!currency) throw new Error("통화를 선택해 주세요.")
  const noteValue = formData.get("note")
  const note = typeof noteValue === "string" ? noteValue.trim().slice(0, 500) : ""

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO provider_monthly_costs
        (provider, billing_month, amount, currency, note, updated_by_user_id, updated_by_email, created_at, updated_at)
       VALUES ($1, to_date($2 || '-01', 'YYYY-MM-DD'), $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (provider, billing_month)
       DO UPDATE SET amount = EXCLUDED.amount,
                     currency = EXCLUDED.currency,
                     note = EXCLUDED.note,
                     updated_by_user_id = EXCLUDED.updated_by_user_id,
                     updated_by_email = EXCLUDED.updated_by_email,
                     updated_at = now()`,
      [provider, month, amount, currency, note || null, actor.id, actor.email],
    )
    await addSystemAudit(client, actor, "provider_monthly_cost_saved", "provider_month", `${provider}:${month}`, {
      provider, month, amount, currency, note,
    })
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  revalidatePath("/super-admin/usage")
  revalidatePath("/super-admin/audit")
  redirect(`/super-admin/usage?month=${month}&saved=1`)
}
