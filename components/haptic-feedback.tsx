"use client"

import { useEffect } from "react"
import { haptic } from "@/lib/haptics"

/** Adds one consistent tactile response to every interactive control in the app. */
export function HapticFeedback() {
  useEffect(() => {
    const selector = [
      "button", "a[href]", "[role='button']", "[role='link']",
      "input[type='button']", "input[type='submit']",
      "input[type='checkbox']", "input[type='radio']", "input[type='color']",
      "select", "summary", "[data-haptic]",
    ].join(", ")

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(selector) as HTMLElement | null
      if (!control) return
      if (control.getAttribute("aria-disabled") === "true") return
      if ("disabled" in control && Boolean((control as HTMLButtonElement).disabled)) return
      haptic()
    }

    // Keyboard activation has no pointerdown event.
    const handleKeyboardClick = (event: MouseEvent) => {
      if (event.detail !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(selector) as HTMLElement | null
      if (!control || control.getAttribute("aria-disabled") === "true") return
      if ("disabled" in control && Boolean((control as HTMLButtonElement).disabled)) return
      haptic()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("click", handleKeyboardClick, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("click", handleKeyboardClick, true)
    }
  }, [])

  return null
}
