import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-xs text-center text-sm font-semibold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-light font-extrabold text-ink hover:bg-light-2",
        destructive:
          "border border-alert bg-transparent font-bold text-alert hover:bg-alert-deep",
        outline:
          "border border-light/40 bg-transparent text-light hover:border-light hover:bg-raised",
        secondary:
          "bg-raised text-light hover:bg-line",
        ghost: "text-light hover:bg-raised",
        link: "px-2 text-light underline underline-offset-4 hover:text-ice",
        // Legacy V1 name; renders as the primary action until the profile screen migrates.
        near: "bg-light font-extrabold text-ink hover:bg-light-2",
      },
      size: {
        default: "min-h-12 px-5 py-2",
        sm: "min-h-11 px-4 text-xs",
        lg: "min-h-14 px-7 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
