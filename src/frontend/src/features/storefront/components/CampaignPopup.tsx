import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import {
  POPUP_DELAY_MS,
  markPopupSeen,
  resolveCampaignImageUrl,
  shouldShowPopup,
  type PopupCampaign,
} from '../utils/campaigns'
import { isCampaignPreviewFrame } from '../utils/preview-frame'
import CampaignLink from './CampaignLink'

const FOCUSABLE = 'a[href], button:not([disabled])'
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

interface PopupCardProps {
  popup: PopupCampaign
  imageUrl: string
  onClose?: () => void
  closeRef?: RefObject<HTMLButtonElement>
  /** Static copy for the admin preview: no link, no close on error, inert close button. */
  preview?: boolean
}

/** The image of the pop-up with its close button. Shared by the real dialog and the admin preview. */
export function PopupCard({ popup, imageUrl, onClose, closeRef, preview = false }: PopupCardProps) {
  return (
    <>
      <CampaignLink url={preview ? null : popup.linkUrl} onClick={onClose} className={`block ${FOCUS}`}>
        <img
          src={imageUrl}
          alt={popup.alt}
          className="block max-h-[85vh] max-w-[90vw] rounded-card object-contain"
          onError={preview ? undefined : onClose}
        />
      </CampaignLink>
      <button
        ref={closeRef}
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        disabled={preview}
        tabIndex={preview ? -1 : undefined}
        className={`absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/70 text-2xl leading-none text-white hover:bg-black ${FOCUS}`}
      >
        <span aria-hidden="true">×</span>
      </button>
    </>
  )
}

interface PopupDialogProps {
  popup: PopupCampaign
  onClose: () => void
}

/**
 * The open dialog: image only (the close button is the single control drawn
 * over it). Moves focus in, traps Tab, closes with Esc or a click on the
 * backdrop, and locks the page scroll while it is mounted.
 */
export function PopupDialog({ popup, onClose }: PopupDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const imageUrl = resolveCampaignImageUrl(popup.imageUrl)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus()
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={popup.alt || 'Promoción'}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative"
      >
        <PopupCard popup={popup} imageUrl={imageUrl} onClose={onClose} closeRef={closeRef} />
      </div>
    </div>
  )
}

interface CampaignPopupProps {
  popup: PopupCampaign | null
}

/**
 * Pop-up of the home page. It appears a few seconds after load, once per
 * browser session for each campaign revision, and only if its image loads.
 */
export default function CampaignPopup({ popup }: CampaignPopupProps) {
  return isCampaignPreviewFrame() ? <PreviewPopup popup={popup} /> : <LivePopup popup={popup} />
}

/**
 * Inside the admin preview iframe: the pop-up is shown at once, over the page of the iframe, with no
 * focus, scroll lock, Escape, session mark or link. Only the draft is shown.
 */
function PreviewPopup({ popup }: CampaignPopupProps) {
  if (!popup) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative">
        <PopupCard popup={popup} imageUrl={resolveCampaignImageUrl(popup.imageUrl)} preview />
      </div>
    </div>
  )
}

function LivePopup({ popup }: CampaignPopupProps) {
  const [open, setOpen] = useState(false)
  const popupId = popup?.id
  const popupRevision = popup?.revision
  const imageUrl = popup ? resolveCampaignImageUrl(popup.imageUrl) : null

  useEffect(() => {
    if (!popup || !imageUrl || !shouldShowPopup(popup)) return undefined
    let cancelled = false
    let probe: HTMLImageElement | null = null
    const timer = window.setTimeout(() => {
      probe = new Image()
      probe.onload = () => {
        if (cancelled) return
        markPopupSeen(popup)
        setOpen(true)
      }
      probe.src = imageUrl
    }, POPUP_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (probe) probe.onload = null
    }
    // The campaign is identified by id and revision; the object itself may be re-created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupId, popupRevision, imageUrl])

  if (!open || !popup) return null
  return <PopupDialog popup={popup} onClose={() => setOpen(false)} />
}
