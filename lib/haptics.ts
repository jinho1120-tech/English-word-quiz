let lastHapticAt = 0

/**
 * Best-effort tactile feedback.
 * The Vibration API works on supported browsers (mostly Android); iOS Safari/PWA
 * does not expose a web API for the iPhone Taptic Engine.
 */
export function haptic(): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
    const now = Date.now()
    if (now - lastHapticAt < 70) return
    lastHapticAt = now
    navigator.vibrate(10)
  } catch {
    // Unsupported devices should never interrupt the interaction.
  }
}
