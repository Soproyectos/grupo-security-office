import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { turnstileSiteKey } from '../utils/auth-errors'

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export type TurnstileHandle = { reset: () => void }

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error('turnstile-load-failed')) }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/**
 * Cloudflare Turnstile (explicit render). Renders nothing when VITE_TURNSTILE_SITE_KEY is
 * not set (development): the page then sends no captcha header.
 */
const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(function TurnstileWidget({ onToken }, ref) {
  const siteKey = turnstileSiteKey()
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  const [failed, setFailed] = useState(false)
  useEffect(() => { onTokenRef.current = onToken }, [onToken])
  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current('')
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
    },
  }))
  useEffect(() => {
    if (!siteKey) return undefined
    let cancelled = false
    loadTurnstile().then(() => {
      if (cancelled || !container.current || !window.turnstile) return
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: 'light',
        language: 'es',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey])
  if (!siteKey) return null
  return (
    <div>
      <div ref={container} className="min-h-[65px]" />
      {failed && <p role="alert" className="mt-2 text-sm text-security-600">No pudimos cargar la verificación de seguridad. Recarga la página e inténtalo de nuevo.</p>}
    </div>
  )
})

export default TurnstileWidget
