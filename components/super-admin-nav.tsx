import Link from "next/link"

const ITEMS = [
  { href: "/super-admin/overview", label: "운영 현황" },
  { href: "/super-admin", label: "가족 관리" },
  { href: "/super-admin/usage", label: "사용량·비용" },
  { href: "/super-admin/limits", label: "사용 한도" },
  { href: "/super-admin/audit", label: "활동 기록" },
]

export function SuperAdminNav({ active }: { active: string }) {
  return (
    <nav aria-label="슈퍼관리자 메뉴" className="flex gap-2 overflow-x-auto pb-1">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active === item.href ? "page" : undefined}
          className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold transition ${active === item.href ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
