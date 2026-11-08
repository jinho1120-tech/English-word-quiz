import { PasswordResetRequestForm } from "@/components/password-reset-request-form"

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-semibold text-primary">영어 단어 학습</p>
      </header>
      <PasswordResetRequestForm />
    </main>
  )
}
