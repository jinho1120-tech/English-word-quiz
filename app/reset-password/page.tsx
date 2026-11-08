import { PasswordResetForm } from "@/components/password-reset-form"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-semibold text-primary">영어 단어 학습</p>
      </header>
      <PasswordResetForm token={params.token} invalid={params.error === "INVALID_TOKEN"} />
    </main>
  )
}
