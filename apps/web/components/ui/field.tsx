import * as React from "react"

import { cn } from "@/lib/utils"

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  suffix?: React.ReactNode
  numeric?: boolean
}

const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, suffix, numeric = false, id, className, ...props }, ref) => {
    const generated = React.useId()
    const inputId = id ?? generated
    const hintId = hint ? `${inputId}-hint` : undefined
    const errorId = error ? `${inputId}-error` : undefined
    const describedBy = [props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <label htmlFor={inputId} className="text-sm font-semibold text-light">{label}</label>
        <div
          className={cn(
            "flex min-h-14 items-center rounded-xs border bg-panel focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ice",
            error ? "border-alert" : "border-edge",
            props.disabled && "opacity-50"
          )}
        >
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "h-full min-h-14 min-w-0 flex-1 bg-transparent px-4 text-light outline-none placeholder:text-light-3 disabled:cursor-not-allowed",
              numeric ? "tabular text-[26px]" : "text-base"
            )}
            {...props}
          />
          {suffix && <span className="px-4 text-sm text-light-3">{suffix}</span>}
        </div>
        {hint && <span id={hintId} className="text-[13px] text-light-3">{hint}</span>}
        {error && <span id={errorId} role="alert" className="text-[13px] text-alert">{error}</span>}
      </div>
    )
  }
)
Field.displayName = "Field"

export { Field }
