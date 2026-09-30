"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

type DialogProps = {
  open: boolean
  onClose(): void
  title: React.ReactNode
  closeLabel: string
  children: React.ReactNode
  className?: string
}

/** Native modal dialog: the browser provides the focus trap, Escape and the inert background. */
function Dialog({ open, onClose, title, closeLabel, children, className }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const openRef = React.useRef(open)

  React.useEffect(() => {
    openRef.current = open
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape closes the native dialog; report it only while the parent still thinks it is open.
      onClose={() => { if (openRef.current) onClose() }}
      className={cn(
        "m-auto w-[min(100%-2rem,32rem)] rounded-xs border border-line bg-panel p-0 text-light backdrop:bg-ink/80",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line p-5">
        <h2 id={titleId} className="font-display text-2xl">{title}</h2>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xs text-light-2 hover:bg-raised hover:text-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}

export { Dialog }
