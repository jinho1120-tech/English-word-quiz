"use client"

import { ButtonHTMLAttributes, ReactNode } from "react"

interface HapticButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onClick?: () => void
  hapticLabel: string
  wrapperClassName?: string
  stopPropagation?: boolean
  children: ReactNode
}

export function HapticButton({
  onClick,
  hapticLabel,
  wrapperClassName = "relative inline-block",
  stopPropagation = false,
  disabled,
  className,
  children,
  ...rest
}: HapticButtonProps) {
  return (
    <span className={wrapperClassName}>
      <button
        type="button"
        aria-label={hapticLabel}
        disabled={disabled}
        className={className}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation()
          onClick?.()
        }}
        {...rest}
      >
        {children}
      </button>
    </span>
  )
}
