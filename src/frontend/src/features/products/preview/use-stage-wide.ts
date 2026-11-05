import { useLayoutEffect, useState, type RefObject } from 'react'

/** Width (px) from which the editor shows the live preview as a third column. */
export const STAGE_WIDE_MIN = 1240

/** Whether a stage of this width (px) is wide enough for the three-column layout. */
export function isWideStage(width: number, min: number = STAGE_WIDE_MIN): boolean {
  return width >= min
}

/**
 * Whether the element is at least STAGE_WIDE_MIN wide, measured on the element itself so the editor follows
 * the space it really gets (not the viewport). Stays false on the server, without a window and without
 * ResizeObserver: the narrow layout is the safe default.
 */
export function useStageWide(ref: RefObject<HTMLElement>): boolean {
  const [wide, setWide] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return

    setWide(isWideStage(element.getBoundingClientRect().width))
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      // Setting the same boolean again is a no-op for React, so only real changes re-render.
      setWide(isWideStage(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return wide
}
