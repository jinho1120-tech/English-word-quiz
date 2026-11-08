import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getChildDeviceSession } from "@/lib/child-auth"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const childSession = await getChildDeviceSession()
  if (childSession) redirect("/child")
  const parentSession = await auth.api.getSession({ headers: await headers() })
  if (parentSession?.user) redirect("/parent")
  redirect("/login")
}
