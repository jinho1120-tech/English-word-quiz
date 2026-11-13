"use client"

import { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"
import { haptic } from "@/lib/haptics"

interface HapticButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onClick?: () => void
  hapticLabel?: string
  stopPropagation?: boolean
  children?: ReactNode
}

export function HapticButton({
  onClick,
  hapticLabel,
  stopPropagation = false,
  disabled,
  className,
  children,
  type = "button",
  "aria-label": ariaLabel,
  title,
  ...rest
}: HapticButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel ?? hapticLabel}
      title={title}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation()
        haptic()
        onClick?.()
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

interface HapticSummaryProps extends HTMLAttributes<HTMLElement> {
  hapticLabel?: string
  children?: ReactNode
}

/**
 * Uses the native summary click/keyboard activation so the parent <details>
 * keeps its built-in open/close behavior. No overlay input is placed over it.
 */
export function HapticSummary({ hapticLabel: _hapticLabel, className, children, onClick, ...rest }: HapticSummaryProps) {
  return (
    <summary
      className={className}
      onClick={(event) => {
        haptic()
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </summary>
  )
}

interface HapticLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  hapticLabel?: string
  children?: ReactNode
}

/**
 * Keeps a real anchor as the only interactive element, preserving navigation,
 * open-in-new-tab, and modifier-click behavior while adding click feedback.
 */
export function HapticLink({ hapticLabel: _hapticLabel, className, children, onClick, ...rest }: HapticLinkProps) {
  return (
    <a
      className={className}
      onClick={(event) => {
        haptic()
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
