"use client"

import { useEffect } from "react"
import { haptic } from "@/lib/haptics"

/** Adds one consistent tactile response to every interactive control in the app. */
export function HapticFeedback() {
  useEffect(() => {
    const handleInteraction = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(
        "button, [role='button'], input[type='checkbox'], input[type='radio'], input[type='color'], select, summary, [data-haptic]"
      ) as HTMLElement | null
      if (!control) return
      if (control.getAttribute("aria-disabled") === "true") return
      if ("disabled" in control && Boolean((control as HTMLButtonElement).disabled)) return
      haptic()
    }

    document.addEventListener("click", handleInteraction, true)
    return () => document.removeEventListener("click", handleInteraction, true)
  }, [])

  return null
}
