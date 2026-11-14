"use client"

import { useState } from "react"
import { formatKoreaDateTime } from "@/lib/korea-time"

type Activity = {
  quizzes: { summary: any[]; recent: any[] }
  games: { summary: any[]; recent: any[] }
  words: { summary: any[]; recent: any[] }
  coupons: { summary: any[]; recent: any[] }
}

const count = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")

export function SuperAdminFamilyActivity({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState("quizzes")
  const sections = [
    { id: "quizzes", title: "퀴즈 실행 · 정답 현황", summary: activity.quizzes.summary },
    { id: "games", title: "게임 실행 기록", summary: activity.games.summary },
    { id: "words", title: "단어 입력 현황", summary: activity.words.summary },
    { id: "coupons", title: "쿠폰 발급·보유 현황", summary: activity.coupons.summary },
  ]
  return (
    <section className="space-y-3 border-t pt-4">
      <div><h3 className="font-bold">가족별 학습·이용 통계</h3><p className="mt-1 text-xs text-muted-foreground">자녀별 집계와 최근 상세 기록 · 시간은 한국시간</p></div>
      {sections.map((section) => (
        <details key={section.id} open={expanded === section.id} onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) setExpanded(section.id)
        }} className="rounded-xl border p-3">
          <summary className="cursor-pointer font-semibold">{section.title}</summary>
          <div className="mt-3 space-y-2">
            {section.id === "quizzes" && <>
              {activity.quizzes.summary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-2 text-sm"><span className="font-semibold">{row.child_name}</span><span>{count(row.attempts)}문항 · 정답 {count(row.correct)} · 정답률 {Number(row.attempts) ? Math.round(Number(row.correct) / Number(row.attempts) * 100) : 0}%</span></div>)}
              {activity.quizzes.recent.map((row, index) => <div key={index} className="border-b py-2 text-xs"><p className="font-semibold">{row.child_name} · {row.subject_name} · {row.word_snapshot}</p><p className="text-muted-foreground">{row.quiz_type === "listening" ? "듣기" : "기본"} · {row.is_correct ? "정답" : "오답"} · 힌트 {row.hint_used ? "사용" : "미사용"} · {formatKoreaDateTime(row.occurred_at)}</p></div>)}
            </>}
            {section.id === "games" && <>
              {activity.games.summary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-2 text-sm"><span className="font-semibold">{row.child_name}</span><span>총 {count(row.plays)}회 · 보카맨 {count(row.vocaman_plays)}회 · 타자 디펜스 {count(row.word_defense_plays)}회</span></div>)}
              {activity.games.recent.map((row, index) => <div key={index} className="flex justify-between gap-2 border-b py-2 text-xs"><span>{row.child_name} · {row.game === "pacman" ? "보카맨" : row.game === "word_defense" ? "영어 타자 디펜스" : row.game}</span><span className="text-muted-foreground">{formatKoreaDateTime(row.occurred_at)}</span></div>)}
            </>}
            {section.id === "words" && <>
              {activity.words.summary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-2 text-sm"><span className="font-semibold">{row.child_name}</span><span>현재 {count(row.current_words)}개 · 최근 30일 추가 {count(row.words_added_30d)}개</span></div>)}
              {activity.words.recent.map((row, index) => <div key={index} className="border-b py-2 text-xs"><p className="font-semibold">{row.child_name} · {row.word} — {row.meaning}</p><p className="text-muted-foreground">{row.subject} · 학습일 {row.assignment_date} · 입력 {formatKoreaDateTime(row.occurred_at)}</p></div>)}
            </>}
            {section.id === "coupons" && <>
              {activity.coupons.summary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-2 text-sm"><span className="font-semibold">{row.child_name}</span><span>보유 {count(row.stored_coupons)}개 · 꽝 {count(row.blank_coupons)}개</span></div>)}
              {activity.coupons.recent.map((row, index) => <div key={index} className="flex justify-between gap-2 border-b py-2 text-xs"><span>{row.child_name} · {row.title} · {row.status === "blank" ? "꽝 쿠폰" : "보유 중"}</span><span className="text-muted-foreground">{formatKoreaDateTime(row.occurred_at)}</span></div>)}
              <p className="text-xs text-muted-foreground">현재 쿠폰 지갑에 남아 있는 발급 내역입니다. 기존 시스템은 사용 승인 시 쿠폰 행을 삭제하므로 과거 사용 내역은 별도 기록 기능 추가 전까지 조회할 수 없습니다.</p>
            </>}
            {section.summary.length === 0 && <p className="py-2 text-xs text-muted-foreground">조회할 자녀 기록이 없습니다.</p>}
          </div>
        </details>
      ))}
    </section>
  )
}
