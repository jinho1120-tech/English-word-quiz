"use client"

import { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"
import { haptic } from "@/lib/haptics"

interface HapticButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onClick?: () => void
  hapticLabel?: string
  wrapperClassName?: string
  stopPropagation?: boolean
  children?: ReactNode
}

export function HapticButton({
  onClick,
  hapticLabel,
  wrapperClassName,
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
    <span className={wrapperClassName ?? `relative inline-flex align-middle ${className?.includes("w-full") ? "w-full" : ""}`}>
      <button
        type={type}
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
        className={className}
        aria-label={ariaLabel}
        title={title}
        {...rest}
      >
        {children}
      </button>

      <input
        type="checkbox"
        {...({ switch: "" } as Record<string, string>)}
        checked={false}
        disabled={disabled}
        aria-label={hapticLabel ?? ariaLabel ?? title ?? "버튼"}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 disabled:cursor-not-allowed"
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          e.currentTarget.checked = false
          haptic()
          onClick?.()
        }}
      />
    </span>
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
