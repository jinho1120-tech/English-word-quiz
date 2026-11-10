"use client"

import { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, SummaryHTMLAttributes } from "react"
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


interface HapticSummaryProps extends SummaryHTMLAttributes<HTMLElement> {
  hapticLabel?: string
  children?: ReactNode
}

/** Keeps native details/summary behavior while adding the same tactile control. */
export function HapticSummary({ hapticLabel, className, children, ...rest }: HapticSummaryProps) {
  return (
    <summary className={`relative ${className ?? ""}`} {...rest}>
      {children}
      <input
        type="checkbox"
        {...({ switch: "" } as Record<string, string>)}
        checked={false}
        aria-label={hapticLabel ?? "항목 열기 또는 닫기"}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        onChange={(event) => {
          event.currentTarget.checked = false
          haptic()
        }}
      />
    </summary>
  )
}

interface HapticLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  hapticLabel?: string
  children?: ReactNode
}

/** Adds the same tactile interaction to navigation links without changing navigation. */
export function HapticLink({ hapticLabel, className, children, "aria-label": ariaLabel, title, ...rest }: HapticLinkProps) {
  return (
    <a className={`relative inline-block ${className ?? ""}`} aria-label={ariaLabel} title={title} {...rest}>
      {children}
      <input
        type="checkbox"
        {...({ switch: "" } as Record<string, string>)}
        checked={false}
        aria-label={hapticLabel ?? ariaLabel ?? title ?? "링크"}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        onChange={(event) => {
          event.currentTarget.checked = false
          haptic()
        }}
      />
    </a>
  )
}
