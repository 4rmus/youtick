import * as React from "react"

import { cn } from "@/lib/utils"

type PanelProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "aside"
  raised?: boolean
}

function Panel({ as: Comp = "div", raised = false, className, ...props }: PanelProps) {
  return (
    <Comp
      className={cn("rounded-xs border border-line p-5 text-light sm:p-6", raised ? "bg-raised" : "bg-panel", className)}
      {...props}
    />
  )
}

export { Panel }
