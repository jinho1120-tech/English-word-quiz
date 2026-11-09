import { createHmac, randomBytes } from "node:crypto"

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits.startsWith("82") ? "0" + digits.slice(2) : digits
}

export async function sendSolapiSms(input: { to: string; text: string }): Promise<{ success: true } | { success: false; error: string }> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim()
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim()
  const from = process.env.SOLAPI_SENDER_PHONE?.trim()
  if (!apiKey || !apiSecret || !from) {
    return { success: false, error: "솔라피 문자 연동 환경변수가 설정되지 않았습니다." }
  }

  const toNumber = normalizePhone(input.to)
  const fromNumber = normalizePhone(from)
  if (!/^0\d{8,10}$/.test(toNumber) || !/^0\d{8,10}$/.test(fromNumber)) {
    return { success: false, error: "수신 또는 발신 전화번호 형식이 올바르지 않습니다." }
  }

  const date = new Date().toISOString()
  const salt = randomBytes(16).toString("hex")
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex")
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`

  try {
    const response = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ messages: [{ to: toNumber, from: fromNumber, text: input.text }] }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      console.error("SOLAPI send failed:", response.status, payload)
      return { success: false, error: "솔라피 문자 발송 요청에 실패했습니다. API 키와 발신번호 등록 상태를 확인해 주세요." }
    }
    return { success: true }
  } catch (error) {
    console.error("SOLAPI network error:", error)
    return { success: false, error: "문자 서비스에 연결하지 못했습니다." }
  }
}
