"use client"

import { useState, useTransition } from "react"
import { withdrawParentAccount } from "@/app/actions/account"

export function AccountWithdrawal() {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function submitWithdrawal() {
    if (confirmation.trim() !== "탈퇴합니다") {
      setError("확인 문구를 정확히 입력해 주세요.")
      return
    }
    setError("")
    startTransition(async () => {
      try {
        await withdrawParentAccount()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "회원 탈퇴에 실패했습니다. 잠시 후 다시 시도해 주세요.")
      }
    })
  }

  return (
    <section className="rounded-2xl border border-red-200 p-4 dark:border-red-900/70">
      <button
        type="button"
        onClick={() => { setOpen((value) => !value); setError(""); setConfirmation("") }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-bold text-red-600">회원 탈퇴</span>
          <span className="mt-1 block text-xs text-muted-foreground">부모 계정과 가족 데이터를 영구 삭제합니다.</span>
        </span>
        <span className="text-sm text-muted-foreground">{open ? "닫기" : "열기"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-red-200 pt-4 dark:border-red-900/70">
          <div className="rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-900 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-bold">탈퇴하면 다음 데이터가 복구할 수 없게 삭제됩니다.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>부모 로그인 계정과 로그인 정보</li>
              <li>내가 대표 부모인 가족의 자녀 프로필과 등록 단어</li>
              <li>학습 기록, 오답 기록, 쿠폰 및 지급·사용 내역</li>
              <li>연결된 자녀 기기와 부모 알림 설정</li>
            </ul>
            <p className="mt-2">공동 관리자가 남아 있는 가족은 데이터 보호를 위해 탈퇴할 수 없습니다. 먼저 공동 관리자를 해제해 주세요.</p>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold">계속하려면 아래 문구를 입력해 주세요: 탈퇴합니다</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              placeholder="탈퇴합니다"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
          {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setConfirmation(""); setError("") }} className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold">
              취소
            </button>
            <button
              type="button"
              disabled={isPending || confirmation.trim() !== "탈퇴합니다"}
              onClick={submitWithdrawal}
              className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {isPending ? "탈퇴 처리 중..." : "계정 영구 삭제"}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
