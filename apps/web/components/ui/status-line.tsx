import * as React from "react"
import { AlertTriangle, Check } from "lucide-react"

import { cn } from "@/lib/utils"

type StatusTone = "neutral" | "progress" | "success" | "error"

type StatusLineProps = {
  tone?: StatusTone
  children: React.ReactNode
  className?: string
}

/** One sentence that says what is safe and what happens next; announced politely, errors assertively. */
function StatusLine({ tone = "neutral", children, className }: StatusLineProps) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 text-[15px] leading-relaxed",
        tone === "error" ? "text-alert" : "text-light-2",
        className
      )}
    >
      {tone === "progress" && (
        <span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-line-strong border-t-ice motion-safe:animate-spin" />
      )}
      {tone === "success" && <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-ice" strokeWidth={3} />}
      {tone === "error" && <AlertTriangle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </p>
  )
}

export { StatusLine }
