import { useSyncExternalStore } from 'react'

const WIDE_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches
}

/** `true` from 1024 px of window width up (false when rendering on the server). */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
