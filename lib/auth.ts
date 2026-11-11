import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { db } from "@/lib/db"
import { schedulePasswordResetEmail } from "@/lib/email"

export const auth = betterAuth({
  appName: "English Word Quiz",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  user: {
    additionalFields: {
      guardianType: {
        type: "string",
        required: false,
        input: true,
        defaultValue: "guardian",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      schedulePasswordResetEmail({
        to: user.email,
        name: user.name,
        url,
      })
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
})
