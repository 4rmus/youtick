import * as React from "react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"

export type StepState = "pending" | "active" | "complete" | "failed"

export type Step = {
  label: React.ReactNode
  detail?: React.ReactNode
  state: StepState
}

type StepsProps = {
  steps: readonly Step[]
  label: string
  className?: string
}

function Steps({ steps, label, className }: StepsProps) {
  return (
    <ol aria-label={label} className={cn("flex flex-col border-t border-line", className)}>
      {steps.map((step, index) => (
        <li
          key={index}
          aria-current={step.state === "active" ? "step" : undefined}
          className={cn(
            "flex min-h-14 items-center gap-4 border-b border-line py-2",
            step.state === "pending" ? "text-light-3" : step.state === "failed" ? "text-alert" : "text-light"
          )}
        >
          <StepMark state={step.state} index={index} />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{step.label}</span>
            {step.detail && <span className="text-[13px] text-light-3">{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

function StepMark({ state, index }: { state: StepState; index: number }) {
  if (state === "complete") {
    return <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-ice text-ink"><Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} /></span>
  }
  if (state === "failed") {
    return <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-alert"><X aria-hidden="true" className="h-4 w-4" strokeWidth={3} /></span>
  }
  return (
    <span className={cn("tabular w-7 shrink-0 text-xl", state === "active" ? "text-ice" : "text-light-3")}>
      {index + 1}
    </span>
  )
}

export { Steps }
