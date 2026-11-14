"use client"

import { useCallback, useEffect, useState } from "react"
import { BookOpen, Info, X } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"

type GuideSection = {
  id: string
  title: string
  summary: string
  steps: string[]
  tip?: string
}

const PARENT_GUIDE: GuideSection[] = [
  {
    id: "start",
    title: "처음 시작하기",
    summary: "자녀 프로필과 과목을 만든 뒤 자녀 기기를 연결하면 바로 사용할 수 있습니다.",
    steps: [
      "부모 화면의 ‘자녀 추가’에서 자녀 이름으로 프로필을 만듭니다.",
      "‘과목 관리’에서 자녀에게 필요한 과목을 자유롭게 추가하고 순서를 정합니다.",
      "자녀 앱 접속코드 또는 QR을 발급해 자녀 기기에서 등록합니다.",
      "‘단어장’에서 부모가 먼저 단어를 등록하거나 자녀가 직접 입력하도록 안내합니다."
    ],
    tip: "자녀마다 과목과 단어장이 따로 관리됩니다. 자녀가 여러 명이어도 학습 데이터가 섞이지 않습니다."
  },
  {
    id: "children",
    title: "자녀 프로필 관리",
    summary: "자녀별 학습 공간과 기기 연결 상태를 관리합니다.",
    steps: [
      "자녀 프로필을 만들고 이름 옆 수정 아이콘으로 이름을 변경할 수 있습니다.",
      "‘일시 비활성화’를 선택하면 연결된 자녀 기기에서 로그아웃됩니다.",
      "다시 활성화하면 새 접속코드가 발급됩니다.",
      "‘영구 삭제’는 해당 자녀의 과목, 단어장, 학습 기록, 보상 기록과 연결 기기를 함께 삭제하므로 신중하게 사용하세요."
    ],
    tip: "단순히 사용을 잠시 중단하려면 영구 삭제 대신 일시 비활성화를 이용하세요."
  },
  {
    id: "connection",
    title: "접속코드와 QR 연결",
    summary: "자녀 기기를 등록하는 방법은 접속코드와 QR 두 가지입니다.",
    steps: [
      "자녀 항목의 ‘접속 관리’를 열고 ‘새 접속코드 발급’ 또는 ‘QR 발급’을 선택합니다.",
      "접속코드는 자녀 앱의 접속코드 입력 화면에 입력합니다.",
      "QR은 자녀 기기로 스캔하면 기기 등록이 자동으로 진행됩니다.",
      "QR은 5분 동안 유효하고 한 번만 사용할 수 있습니다. 만료되거나 사용했다면 새로 발급하세요.",
      "접속코드를 새로 발급하면 이전 코드는 즉시 사용할 수 없습니다."
    ],
    tip: "‘초대문자 보내기’는 새 접속코드를 발급한 뒤 문자 작성 화면을 엽니다. 기존 코드를 계속 쓰려는 경우에는 누르지 마세요."
  },
  {
    id: "subjects",
    title: "과목 관리",
    summary: "과목은 자녀별로 자유롭게 구성할 수 있습니다.",
    steps: [
      "자녀 카드에서 ‘과목 관리’를 엽니다.",
      "새 과목 이름을 입력하고 ‘과목 추가’를 누릅니다.",
      "위·아래 화살표로 표시 순서를 바꾸고, ‘이름 변경’으로 과목명을 수정합니다.",
      "과목 삭제 시 해당 단어는 삭제되지 않고 과목 미지정 상태가 됩니다. 과거 학습 기록도 보존됩니다."
    ],
    tip: "과목 이름과 개수는 자녀마다 달라도 됩니다."
  },
  {
    id: "words",
    title: "단어장 관리",
    summary: "부모도 자녀의 단어를 날짜와 과목별로 등록하고 관리할 수 있습니다.",
    steps: [
      "자녀 카드에서 ‘단어장’을 열고 달력에서 단어를 등록할 날짜를 선택합니다.",
      "저장할 과목을 선택한 뒤 단어와 뜻을 직접 입력합니다.",
      "단어장 사진을 올리면 AI가 단어와 뜻을 추출합니다. 저장 전에 결과를 검토하고 수정하거나 제외할 수 있습니다.",
      "여러 단어는 한 줄에 ‘영단어 | 뜻 | 예문(선택)’ 형식으로 입력할 수 있습니다.",
      "등록된 단어는 과목별로 확인·수정·삭제할 수 있습니다."
    ],
    tip: "최근 30일 학습 현황에서 푼 문제, 정답, 정답률과 과목별 결과를 확인할 수 있습니다."
  },
  {
    id: "rewards",
    title: "쿠폰과 학습 보상",
    summary: "퀴즈 결과에 따라 쿠폰을 발급하도록 자녀별 조건을 설정합니다.",
    steps: [
      "부모 화면의 ‘쿠폰 · 보상 · 게임’에서 관리할 자녀를 선택합니다.",
      "‘쿠폰 설정’에서 보상 사용 여부, 최소 정답률, 최소 문제 수, 힌트 사용 제한을 설정합니다.",
      "일반 쿠폰과 꽝 쿠폰의 발행 확률 및 쿠폰함 최대 보관 개수를 정합니다.",
      "‘쿠폰 관리’에서 쿠폰 이름과 설명을 등록·수정하고 사용 여부를 설정합니다.",
      "자녀가 쿠폰 사용 QR을 보여주면 부모 기기에서 스캔해 사용을 승인합니다."
    ],
    tip: "쿠폰 설정을 꺼도 이미 발급된 쿠폰이 자동으로 사라지는 것은 아닙니다."
  },
  {
    id: "games",
    title: "게임 이용 설정",
    summary: "게임 노출 여부와 보너스 게임 이용 조건을 관리합니다.",
    steps: [
      "‘게임 설정’에서 게임 보상 사용 여부와 자녀별 게임 표시 여부를 설정합니다.",
      "하루 최소 퀴즈 문제 수와 오답을 모두 정리해야 하는 조건을 설정할 수 있습니다.",
      "하루 이용 횟수를 설정합니다. 0회 제한은 무제한을 뜻합니다.",
      "게임은 자녀 앱의 ‘오답 몬스터’ 영역에 조건을 충족하면 표시됩니다."
    ],
    tip: "보카맨과 영어 타자 디펜스는 오늘의 보너스 게임 이용 횟수를 함께 사용할 수 있습니다."
  },
  {
    id: "notifications",
    title: "알림 설정",
    summary: "자녀의 쿠폰과 기기 관련 알림을 앱 안에서 확인하고 기기 푸시를 설정합니다.",
    steps: [
      "부모 화면의 알림함에서 새 알림을 확인하고 누르면 관련 화면으로 이동합니다.",
      "‘알림 및 푸시 설정’에서 기기 푸시 알림을 켜거나 끕니다.",
      "쿠폰 발행, 쿠폰 사용 요청, 벌칙, 기기 등록 등 알림 종류별 수신 여부를 조정할 수 있습니다."
    ],
    tip: "브라우저 알림 권한이 허용되어 있어야 앱을 닫은 상태에서도 푸시 알림을 받을 수 있습니다."
  },
  {
    id: "admins",
    title: "공동관리자",
    summary: "가족 대표는 다른 보호자를 공동관리자로 초대할 수 있습니다.",
    steps: [
      "‘공동관리자 관리’에서 초대할 이메일을 입력하고 초대 링크를 만듭니다.",
      "링크를 복사하거나 문자로 전달합니다.",
      "초대받은 사람은 해당 이메일로 가입 또는 로그인해야 합니다. 초대 링크는 7일 후 만료됩니다.",
      "가족 대표는 공동관리자를 해제할 수 있습니다."
    ],
    tip: "공동관리자는 같은 가족의 자녀와 학습 데이터를 함께 관리합니다. 초대·관리자 해제는 가족 대표 권한이 필요합니다."
  },
  {
    id: "appearance",
    title: "화면 테마 설정",
    summary: "부모·자녀 앱에서 화면 모드와 메인 강조색을 바꿀 수 있습니다.",
    steps: [
      "화면 오른쪽 위 팔레트 아이콘을 누릅니다.",
      "기기 설정, 라이트, 다크 모드 중 하나를 선택합니다.",
      "색상 프리셋 또는 직접 색상 선택으로 강조색을 바꿉니다."
    ],
    tip: "테마 설정은 같은 브라우저의 부모·자녀 화면에 함께 적용됩니다."
  }
]

const CHILD_GUIDE: GuideSection[] = [
  {
    id: "start",
    title: "처음 시작하기",
    summary: "부모님이 알려주신 접속코드나 QR로 내 학습 공간에 들어옵니다.",
    steps: [
      "부모님이 보내주신 자녀 앱 주소를 엽니다.",
      "접속코드를 받았다면 입력하고, QR을 받았다면 휴대폰 카메라로 스캔합니다.",
      "처음 등록한 뒤에는 이 기기에서 자동으로 로그인됩니다.",
      "홈 화면에 앱 아이콘을 추가하면 다음부터 더 편하게 접속할 수 있습니다."
    ],
    tip: "접속이 되지 않거나 코드가 만료되었다면 부모님께 새 접속코드나 QR을 요청하세요."
  },
  {
    id: "calendar",
    title: "날짜와 과목 선택",
    summary: "달력에서 공부할 날짜를 고르고 과목을 선택해 단어를 확인합니다.",
    steps: [
      "달력에서 날짜를 누르면 그 날짜에 등록된 단어를 볼 수 있습니다.",
      "‘날짜별 퀴즈’ 또는 ‘오답 몬스터’ 탭 위의 과목 버튼을 눌러 과목별로 학습할 수 있습니다.",
      "‘전체’를 선택하면 여러 과목의 단어를 함께 확인합니다."
    ],
    tip: "부모님이 단어를 추가하면 자녀 화면에도 해당 날짜와 과목에 맞춰 표시됩니다."
  },
  {
    id: "quiz",
    title: "날짜별 퀴즈",
    summary: "선택한 날짜의 단어를 퀴즈로 풀고 발음도 연습합니다.",
    steps: [
      "‘날짜별 퀴즈’를 선택하고 날짜와 과목을 고릅니다.",
      "퀴즈 시작 화면에서 ‘뜻 보고 영어 쓰기’ 또는 ‘듣고 영어와 뜻 쓰기’를 선택합니다.",
      "듣기 유형에서는 영어 발음을 듣고 영어 단어와 우리말 뜻을 입력합니다.",
      "퀴즈를 마치면 결과를 확인할 수 있습니다.",
      "설정된 조건을 만족하면 쿠폰 보상을 받을 수 있습니다."
    ],
    tip: "발음이 잘 들리지 않으면 음성 설정에서 목소리나 느린 재생 옵션을 확인하세요."
  },
  {
    id: "wrong",
    title: "오답 몬스터와 다시 공부하기",
    summary: "틀렸던 단어를 다시 풀어보며 약한 단어를 정리합니다.",
    steps: [
      "‘오답 몬스터’를 눌러 틀린 단어를 모아 봅니다.",
      "과목 버튼을 이용해 특정 과목의 오답만 연습할 수 있습니다.",
      "오답을 다시 풀어 정리하면 보너스 게임 이용 조건을 채우는 데 도움이 됩니다."
    ],
    tip: "오답 단어가 없다면 부모님이 등록한 단어를 먼저 학습하고 퀴즈를 풀어보세요."
  },
  {
    id: "words",
    title: "단어 입력하기",
    summary: "직접 입력하거나 사진에서 AI로 단어를 추출해 내 단어장에 추가할 수 있습니다.",
    steps: [
      "‘단어 입력’ 탭을 누르고 저장할 과목을 선택합니다.",
      "‘하나씩 입력’에서는 영어 단어와 뜻을 입력하고, 예문은 필요할 때 추가합니다.",
      "‘일괄 입력’에서는 한 줄에 한 단어씩 ‘영단어 | 뜻 | 예문(선택)’ 형식으로 입력합니다.",
      "단어장 사진을 올리면 AI가 단어와 뜻을 추출합니다. 결과를 확인하고 수정한 뒤 저장하세요.",
      "단어 목록에서 과목별로 확인하고 수정하거나 삭제할 수 있습니다."
    ],
    tip: "AI 추출 결과는 저장 전에 꼭 확인해 주세요. 사진이 흐리거나 글자가 작으면 결과가 정확하지 않을 수 있습니다."
  },
  {
    id: "games",
    title: "보너스 게임",
    summary: "학습 조건을 충족하면 두 가지 영어 단어 게임을 즐길 수 있습니다.",
    steps: [
      "‘오답 몬스터’ 화면의 보너스 게임 영역을 확인합니다.",
      "보카맨(Voca-Man)은 방향키 또는 화면 조작 버튼으로 움직입니다.",
      "영어 타자 디펜스는 단어를 입력해 게임을 진행합니다.",
      "하루 이용 횟수와 입장 조건은 부모님이 설정합니다."
    ],
    tip: "게임을 시작하면 이용 횟수가 차감될 수 있으며, 중간에 나가도 복구되지 않을 수 있습니다."
  },
  {
    id: "coupons",
    title: "쿠폰 보관함과 사용",
    summary: "퀴즈 보상으로 받은 쿠폰을 보관하고 부모님께 사용을 요청합니다.",
    steps: [
      "쿠폰을 받으면 화면 위쪽의 ‘쿠폰함’에서 확인합니다.",
      "사용할 쿠폰의 ‘사용하기’를 누르면 QR 코드가 만들어집니다.",
      "부모님께 QR을 보여드리면 부모님이 스캔해 사용을 승인합니다.",
      "승인되면 쿠폰은 보관함에서 자동으로 사라집니다."
    ],
    tip: "쿠폰 QR은 5분 후 만료됩니다. 만료되면 새 QR을 만들어 주세요."
  },
  {
    id: "appearance",
    title: "화면 꾸미기",
    summary: "화면 모드와 강조색을 내 취향에 맞게 바꿀 수 있습니다.",
    steps: [
      "화면 오른쪽 위 팔레트 아이콘을 누릅니다.",
      "기기 설정, 라이트, 다크 모드를 선택합니다.",
      "원하는 색상 프리셋이나 직접 고른 색상을 적용합니다."
    ],
    tip: "테마 설정은 같은 브라우저에서 부모님 화면과 공유됩니다."
  }
]

export function HelpCenter({
  audience,
  initialSection = "start",
  featureVisibility,
}: {
  audience: "parent" | "child"
  initialSection?: string
  featureVisibility?: {
    couponsEnabled?: boolean
    pacmanEnabled?: boolean
    wordDefenseEnabled?: boolean
  }
}) {
  const couponsEnabled = featureVisibility?.couponsEnabled ?? false
  const pacmanEnabled = featureVisibility?.pacmanEnabled ?? false
  const wordDefenseEnabled = featureVisibility?.wordDefenseEnabled ?? false
  const guide = audience === "parent"
    ? PARENT_GUIDE
    : CHILD_GUIDE
      .filter((section) => section.id !== "coupons" || couponsEnabled)
      .filter((section) => section.id !== "games" || pacmanEnabled || wordDefenseEnabled)
      .map((section) => {
        if (section.id === "games") {
          return {
            ...section,
            steps: section.steps.filter((step) => {
              if (step.startsWith("보카맨(Voca-Man)은")) return pacmanEnabled
              if (step.startsWith("영어 타자 디펜스는")) return wordDefenseEnabled
              return true
            }),
          }
        }
        if (section.id === "quiz") {
          return {
            ...section,
            steps: section.steps.filter((step) =>
              !step.startsWith("설정된 조건을 만족하면 쿠폰 보상을") || couponsEnabled
            ),
          }
        }
        if (section.id === "wrong") {
          return {
            ...section,
            steps: section.steps.filter((step) =>
              !step.includes("보너스 게임 이용 조건") || pacmanEnabled || wordDefenseEnabled
            ),
          }
        }
        return section
      })
  const storageKey = `english-word-master-guide-seen-${audience}`
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState(initialSection)

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey)) setOpen(true)
    } catch {
      setOpen(false)
    }
  }, [storageKey])

  const closeGuide = useCallback(() => {
    setOpen(false)
    try {
      window.localStorage.setItem(storageKey, "1")
    } catch {
      // The guide remains available from the info button.
    }
  }, [storageKey])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeGuide()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, closeGuide])

  function showGuide(sectionId = initialSection) {
    setActiveId(sectionId)
    setOpen(true)
  }

  const activeSection = guide.find((section) => section.id === activeId) ?? guide[0]

  return (
    <>
      <HapticButton
        type="button"
        onClick={() => showGuide()}
        aria-label={audience === "parent" ? "부모 앱 사용 설명서" : "자녀 앱 사용 설명서"}
        title="앱 사용 설명서"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info className="size-4" />
      </HapticButton>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeGuide()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-guide-title"
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:max-h-[86dvh] sm:rounded-3xl"
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary-container-foreground">
                <BookOpen className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="app-guide-title" className="font-black">
                  {audience === "parent" ? "부모 앱 사용 설명서" : "자녀 앱 사용 설명서"}
                </h2>
                <p className="text-xs text-muted-foreground">처음 사용하는 분도 쉽게 따라 할 수 있어요.</p>
              </div>
              <HapticButton
                type="button"
                onClick={closeGuide}
                aria-label="사용 설명서 닫기"
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground"
              >
                <X className="size-4" />
              </HapticButton>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[190px_minmax(0,1fr)]">
              <nav aria-label="설명서 목차" className="flex gap-2 overflow-x-auto border-b border-border bg-muted/30 p-3 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
                {guide.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    aria-current={activeSection.id === section.id ? "page" : undefined}
                    onClick={() => setActiveId(section.id)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors sm:w-full sm:text-sm ${activeSection.id === section.id ? "bg-primary-container text-primary-container-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>

              <article className="min-h-0 overflow-y-auto p-4 sm:p-5">
                <h3 className="text-lg font-black">{activeSection.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{activeSection.summary}</p>
                <ol className="mt-4 space-y-3">
                  {activeSection.steps.map((step, index) => (
                    <li key={index} className="flex gap-3 text-sm leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-primary-container-foreground">{index + 1}</span>
                      <span className="min-w-0 flex-1 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                {activeSection.tip && (
                  <div className="mt-5 rounded-xl border border-border bg-muted/50 p-3">
                    <p className="text-xs font-bold">도움말</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{activeSection.tip}</p>
                  </div>
                )}
              </article>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <p className="text-[11px] text-muted-foreground">ⓘ 버튼을 누르면 언제든 다시 볼 수 있습니다.</p>
              <HapticButton
                type="button"
                onClick={closeGuide}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              >
                확인하고 시작하기
              </HapticButton>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
