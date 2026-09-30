import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const chipVariants = cva(
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-extrabold uppercase leading-none tracking-[0.1em]",
  {
    variants: {
      tone: {
        owned: "bg-ice text-ink",
        onSale: "bg-ice-deep text-ice",
        paused: "bg-alert-deep text-alert",
        neutral: "bg-raised text-light-2",
        outline: "border border-light text-light",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof chipVariants> {}

function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />
}

export { Chip, chipVariants }
