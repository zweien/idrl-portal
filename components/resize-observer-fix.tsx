"use client"

import { useEffect } from "react"

export function ResizeObserverFix() {
  useEffect(() => {
    // Suppress ResizeObserver loop error - this is a benign error
    // that occurs when ResizeObserver callbacks cause layout changes
    const errorHandler = (e: ErrorEvent) => {
      if (e.message?.includes("ResizeObserver loop")) {
        e.stopImmediatePropagation()
        e.preventDefault()
        return false
      }
    }

    const rejectionHandler = (e: PromiseRejectionEvent) => {
      if (e.reason?.message?.includes("ResizeObserver loop")) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }

    window.addEventListener("error", errorHandler, true)
    window.addEventListener("unhandledrejection", rejectionHandler, true)

    // Patch ResizeObserver to catch errors at the source
    const OriginalResizeObserver = window.ResizeObserver
    window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          requestAnimationFrame(() => {
            try {
              callback(entries, observer)
            } catch {
              // Silently ignore ResizeObserver callback errors
            }
          })
        })
      }
    }

    return () => {
      window.removeEventListener("error", errorHandler, true)
      window.removeEventListener("unhandledrejection", rejectionHandler, true)
      window.ResizeObserver = OriginalResizeObserver
    }
  }, [])

  return null
}
