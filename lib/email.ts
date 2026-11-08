import { after } from "next/server"

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!)
}

export async function sendPasswordResetEmail({
  to,
  name,
  url,
}: {
  to: string
  name: string
  url: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured")
  }

  const safeName = escapeHtml(name || "회원")
  const safeUrl = escapeHtml(url)

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "[영어 단어 학습] 비밀번호 재설정 안내",
      html: `<!doctype html><html lang="ko"><body style="font-family:Arial,sans-serif;line-height:1.7;color:#222"><h2>비밀번호 재설정</h2><p>${safeName}님, 비밀번호 재설정 요청이 접수되었습니다.</p><p>아래 버튼을 눌러 새 비밀번호를 설정해 주세요. 이 링크는 보안을 위해 제한된 시간 동안만 사용할 수 있습니다.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">비밀번호 재설정하기</a></p><p>본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 기존 비밀번호는 변경되지 않습니다.</p></body></html>`,
      text: `${name || "회원"}님, 비밀번호를 재설정하려면 아래 링크를 열어 주세요.\n\n${url}\n\n본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.`,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Resend email failed (${response.status}): ${detail}`)
  }
}

export function schedulePasswordResetEmail(input: {
  to: string
  name: string
  url: string
}) {
  after(async () => {
    try {
      await sendPasswordResetEmail(input)
    } catch (error) {
      console.error("Password reset email delivery failed:", error)
    }
  })
}
