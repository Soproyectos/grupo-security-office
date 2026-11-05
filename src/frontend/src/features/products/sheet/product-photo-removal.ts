/**
 * Inline confirmation state for removing one product photo.
 * Pure state only: the section renders it and performs the request.
 */
export type ActivePhotoRemovalPhase = 'confirming' | 'deleting' | 'failed'
export type PhotoRemovalPhase = 'idle' | ActivePhotoRemovalPhase

export type PhotoRemovalState = { phase: 'idle' } | { phase: ActivePhotoRemovalPhase; imageId: string }

export type PhotoRemovalAction =
  | { type: 'open'; imageId: string }
  | { type: 'cancel' }
  | { type: 'confirm'; imageId: string }
  | { type: 'succeeded' }
  | { type: 'failed' }

export const IDLE_PHOTO_REMOVAL: PhotoRemovalState = { phase: 'idle' }

export function photoRemovalReducer(state: PhotoRemovalState, action: PhotoRemovalAction): PhotoRemovalState {
  switch (action.type) {
    case 'open':
      // Only one confirmation at a time: opening another photo closes the previous one.
      // A running delete keeps its state until the request settles.
      return state.phase === 'deleting' ? state : { phase: 'confirming', imageId: action.imageId }
    case 'cancel':
      return state.phase === 'deleting' ? state : IDLE_PHOTO_REMOVAL
    case 'confirm':
      // Starts from the confirmation, or from a failed attempt ("Reintentar").
      return (state.phase === 'confirming' || state.phase === 'failed') && state.imageId === action.imageId
        ? { phase: 'deleting', imageId: action.imageId }
        : state
    case 'succeeded':
      return state.phase === 'deleting' ? IDLE_PHOTO_REMOVAL : state
    case 'failed':
      return state.phase === 'deleting' ? { phase: 'failed', imageId: state.imageId } : state
  }
}

/** Phase of one photo's card: idle unless this photo is the one being confirmed or removed. */
export function photoRemovalPhase(state: PhotoRemovalState, imageId: string): PhotoRemovalPhase {
  return state.phase !== 'idle' && state.imageId === imageId ? state.phase : 'idle'
}
