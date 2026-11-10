"use client"

import { useEffect } from "react"
import { haptic } from "@/lib/haptics"

/** Adds one consistent tactile response to every interactive control in the app. */
export function HapticFeedback() {
  useEffect(() => {
    const selector = [
      "button", "a[href]", "[role='button']", "[role='link']",
      "input[type='button']", "input[type='submit']", "input[type='checkbox']",
      "input[type='radio']", "input[type='color']", "input[type='range']",
      "select", "summary", "label", "[tabindex]:not([tabindex='-1'])",
      "[class~='cursor-pointer']", "[data-haptic]",
    ].join(", ")

    // Use click as the single activation point. This covers pointer, touch,
    // keyboard and assistive-technology activation without relying on pointerdown.
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(selector) as HTMLElement | null
      if (!control) return
      if (control.getAttribute("aria-disabled") === "true") return
      if ("disabled" in control && Boolean((control as HTMLButtonElement).disabled)) return
      haptic()
    }

    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [])

  return null
}
