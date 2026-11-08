import { ChildQrEnrollment } from "@/components/child-qr-enrollment"

export default async function ChildEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) return <main className="p-8 text-center">QR 등록 정보가 없습니다.</main>
  return <ChildQrEnrollment token={token} />
}
