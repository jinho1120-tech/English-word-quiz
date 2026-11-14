import { formatKoreaDateTime } from "@/lib/korea-time"

type Activity = {
  quizzes: { summary: any[]; recent: any[] }
  games: { summary: any[]; recent: any[] }
  words: { summary: any[]; recent: any[] }
  coupons: { summary: any[]; recent: any[]; eventsSummary: any[]; eventsRecent: any[] }
}

const count = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")

export function SuperAdminFamilyActivity({ activity }: { activity: Activity }) {
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
        <details key={section.id} open={section.id === "quizzes"} className="rounded-xl border p-3">
          <summary className="cursor-pointer font-semibold">{section.title}</summary>
          <div className="mt-3 space-y-2">
            {section.id === "quizzes" && <>
              {activity.quizzes.summary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-2 text-sm"><span className="font-semibold">{row.child_name}</span><span>{count(row.attempts)}문항 · 정답 {count(row.correct)} · 정답률 {Number(row.attempts) ? Math.round(Number(row.correct) / Number(row.attempts) * 100) : 0}%</span></div>)}
              {activity.quizzes.recent.map((row, index) => <div key={index} className="border-b py-2 text-xs"><p className="font-semibold">{row.child_name} · {row.subject_name} · 퀴즈 {index + 1}</p><p className="text-muted-foreground">{count(row.question_count)}문항 · 정답 {count(row.correct_count)} · 정답률 {Number(row.question_count) ? Math.round(Number(row.correct_count) / Number(row.question_count) * 100) : 0}% · 힌트 {row.hint_used ? "사용" : "미사용"}</p><p className="text-muted-foreground">{formatKoreaDateTime(row.started_at)} ~ {formatKoreaDateTime(row.completed_at)}</p></div>)}
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
              {activity.coupons.eventsSummary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-2 text-sm"><span className="font-semibold">{row.child_name}</span><span>총 발급 {count(row.issued_count)}개 · 사용 {count(row.redeemed_count)}개</span></div>)}
              {activity.coupons.summary.map((row) => <div key={row.child_id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-2 text-xs"><span>{row.child_name} · 현재 보유</span><span>{count(row.stored_coupons)}개 · 꽝 {count(row.blank_coupons)}개</span></div>)}
              {activity.coupons.eventsRecent.map((row, index) => <div key={index} className="flex justify-between gap-2 border-b py-2 text-xs"><span>{row.child_name} · {row.coupon_title} · {row.event_type === "redeemed" ? "사용 완료" : "발급"}</span><span className="text-muted-foreground">{formatKoreaDateTime(row.occurred_at)}</span></div>)}
              {activity.coupons.eventsRecent.length === 0 && <p className="text-xs text-muted-foreground">쿠폰 활동 이력 테이블은 마이그레이션 적용 후부터 발급·사용 기록을 보존합니다. 과거에 이미 삭제된 쿠폰 사용 이력은 복원할 수 없습니다.</p>}
            </>}
            {section.summary.length === 0 && <p className="py-2 text-xs text-muted-foreground">조회할 자녀 기록이 없습니다.</p>}
          </div>
        </details>
      ))}
    </section>
  )
}
