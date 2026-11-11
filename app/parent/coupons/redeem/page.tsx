import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getCouponRedemptionDetails } from "@/app/actions/coupons"
import { CouponRedeemConfirmation } from "@/components/coupon-redeem-confirmation"

export const dynamic = "force-dynamic"

export default async function CouponRedeemPage({ searchParams }: { searchParams: Promise<{ token?: string; completed?: string }> }) {
  const { token, completed } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  const returnTo = completed === "1"
    ? "/parent/coupons/redeem?completed=1"
    : token
      ? "/parent/coupons/redeem?token=" + encodeURIComponent(token)
      : "/parent/coupons/redeem"
  if (!session) redirect("/login?next=" + encodeURIComponent(returnTo))

  if (completed === "1") {
    return <main className="mx-auto min-h-dvh w-full max-w-lg px-4 py-8"><section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center text-emerald-900"><p className="text-3xl">✓</p><h1 className="mt-2 text-xl font-black">쿠폰 사용 완료</h1><p className="mt-2 text-sm">쿠폰이 정상적으로 승인되어 자녀 쿠폰함에서 삭제되었습니다.</p></section></main>
  }
  if (!token) return <main className="mx-auto max-w-lg p-5"><p className="rounded-xl bg-muted p-4">QR에 쿠폰 정보가 없습니다.</p></main>
  let details: Awaited<ReturnType<typeof getCouponRedemptionDetails>>
  try { details = await getCouponRedemptionDetails(token) }
  catch (error) { return <main className="mx-auto max-w-lg p-5"><h1 className="text-xl font-black">쿠폰 확인 실패</h1><p className="mt-2 text-sm text-red-600">{error instanceof Error ? error.message : "쿠폰을 확인할 수 없습니다."}</p></main> }
  return <main className="mx-auto min-h-dvh w-full max-w-lg px-4 py-8"><CouponRedeemConfirmation token={token} {...details} /></main>
}
