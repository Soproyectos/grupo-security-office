export const UNSAVED_CONFIRM = 'Hay cambios sin guardar. ¿Salir sin guardarlos?'

/** Closing is free unless there are unsaved changes; then the person must confirm. */
export function canLeave(dirty: boolean, ask: (message: string) => boolean): boolean {
  return !dirty || ask(UNSAVED_CONFIRM)
}
