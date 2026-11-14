"use server"

import nodemailer from "nodemailer"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/super-admin"

function readText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  if (typeof value !== "string") throw new Error("입력값이 올바르지 않습니다.")
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) throw new Error(`내용은 1~${maxLength}자로 입력해 주세요.`)
  return trimmed
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!)
}

export async function sendSuperAdminAnnouncement(formData: FormData) {
  const actor = await requireSuperAdmin()
  const subject = readText(formData, "subject", 120)
  const message = readText(formData, "message", 5000)
  if (formData.get("confirmSend") !== "yes") throw new Error("발송 확인 항목을 체크해 주세요.")

  const gmailUser = process.env.GMAIL_USER
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "")
  if (!gmailUser || !appPassword) throw new Error("단체메일 발송 설정이 없습니다. GMAIL_USER와 GMAIL_APP_PASSWORD를 확인해 주세요.")

  const audience = await pool.query(`
    SELECT email FROM (
      SELECT lower(u.email) AS email
      FROM families f
      INNER JOIN "user" u ON u.id = f.owner_user_id
      WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
      UNION
      SELECT lower(fm.email) AS email
      FROM family_members fm
      WHERE fm.email IS NOT NULL AND btrim(fm.email) <> ''
    ) recipients
    ORDER BY email
    LIMIT 451
  `)
  const emails = audience.rows.map((row) => String(row.email))
  if (emails.length === 0) throw new Error("발송 대상 이메일이 없습니다.")
  if (emails.length > 450) throw new Error("현재 단체메일은 한 번에 최대 450명까지 발송합니다. 대상 분할 기능을 먼저 사용해 주세요.")

  const safeSubject = subject.replace(/[\\r\\n]+/g, " ").trim()
  const safeMessage = escapeHtml(message).replace(/\\n/g, "<br />")
  const audit = await pool.query(
    `INSERT INTO super_admin_system_audit_logs (actor_user_id, actor_email, action, target_type, target_id, details)
     VALUES ($1, $2, 'announcement_sending', 'announcement', NULL, $3::jsonb)
     RETURNING id`,
    [actor.id, actor.email, JSON.stringify({ subject: safeSubject, recipientCount: emails.length })],
  )
  const auditId = audit.rows[0].id
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: appPassword },
  })
  try {
    await transporter.sendMail({
      from: { name: "영어 단어 학습 운영팀", address: gmailUser },
      to: gmailUser,
      bcc: emails,
      subject: `[영어 단어 학습 공지] ${safeSubject}`,
      text: message,
      html: `<!doctype html><html lang="ko"><body style="font-family:Arial,sans-serif;line-height:1.8;color:#222;max-width:680px;margin:0 auto;padding:24px"><h2>${escapeHtml(safeSubject)}</h2><p>${safeMessage}</p><hr><p style="font-size:12px;color:#777">영어 단어 학습 서비스 공지 메일입니다.</p></body></html>`,
    })
  } catch (error) {
    await pool.query(
      `UPDATE super_admin_system_audit_logs
       SET action = 'announcement_send_failed', details = $2::jsonb
       WHERE id = $1`,
      [auditId, JSON.stringify({ subject: safeSubject, recipientCount: emails.length, error: error instanceof Error ? error.message.slice(0, 500) : "unknown" })],
    ).catch(() => undefined)
    throw new Error("메일 발송에 실패했습니다. SMTP 설정과 메일 계정의 발송 한도를 확인해 주세요.")
  } finally {
    await transporter.close()
  }

  // The email has already been submitted successfully. Never report a send failure
  // merely because the follow-up audit update failed, which could cause duplicate sends.
  await pool.query(
    `UPDATE super_admin_system_audit_logs
     SET action = 'announcement_sent', details = $2::jsonb
     WHERE id = $1`,
    [auditId, JSON.stringify({ subject: safeSubject, recipientCount: emails.length })],
  ).catch((error) => console.error("Announcement audit update failed:", error))
  redirect(`/super-admin/announcements?sent=1&count=${emails.length}`)
}
