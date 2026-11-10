"use client"

import { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode, useRef } from "react"
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
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onChange={(event) => {
          event.currentTarget.checked = false
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
 * Uses the same transparent checkbox activation as HapticButton.
 * The real summary is activated programmatically so native <details> behavior
 * and its onClick callback are preserved while the checkbox supplies feedback.
 */
export function HapticSummary({ hapticLabel, className, children, onClick, ...rest }: HapticSummaryProps) {
  const summaryRef = useRef<HTMLSummaryElement>(null)

  return (
    <span className="relative block">
      <summary
        ref={summaryRef}
        aria-hidden="true"
        tabIndex={-1}
        className={className}
        onClick={onClick}
        {...rest}
      >
        {children}
      </summary>
      <input
        type="checkbox"
        {...({ switch: "" } as Record<string, string>)}
        checked={false}
        aria-label={hapticLabel ?? "항목 펼치기 또는 접기"}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        onMouseDown={(event) => event.preventDefault()}
        onChange={(event) => {
          event.currentTarget.checked = false
          haptic()
          summaryRef.current?.click()
        }}
      />
    </span>
  )
}

interface HapticLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  hapticLabel?: string
  children?: ReactNode
}

/**
 * Uses the same transparent checkbox activation as HapticButton, then activates
 * the real anchor so Next.js/client navigation and the supplied click handler run.
 */
export function HapticLink({ hapticLabel, className, children, onClick, ...rest }: HapticLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null)

  return (
    <span className={`relative inline-flex align-middle ${className?.includes("w-full") ? "w-full" : ""}`}>
      <a
        ref={linkRef}
        aria-hidden="true"
        tabIndex={-1}
        className={className}
        {...rest}
        onClick={(event) => onClick?.(event)}
      >
        {children}
      </a>
      <input
        type="checkbox"
        {...({ switch: "" } as Record<string, string>)}
        checked={false}
        aria-label={hapticLabel ?? rest["aria-label"] ?? rest.title ?? "링크"}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        onMouseDown={(event) => event.preventDefault()}
        onChange={(event) => {
          event.currentTarget.checked = false
          haptic()
          linkRef.current?.click()
        }}
      />
    </span>
  )
}
