import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FirmwareFile } from '../types';
import { ui } from '../styles';
import { CloseIcon, DownloadIcon } from './icons';

interface LicenseModalProps {
  file: FirmwareFile | null;
  onCancel: () => void;
  onAccept: (file: FirmwareFile) => void;
  /** Texto del acuerdo. Si no se pasa, se usa un texto de ejemplo. */
  children?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana con el acuerdo de licencia que se muestra antes de descargar firmware.
 * Accesible: role="dialog", cierra con Escape, mantiene el foco dentro y lo devuelve al cerrar.
 */
export function LicenseModal({ file, onCancel, onAccept, children }: LicenseModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const open = file !== null;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    acceptRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!file) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="license-modal-title"
        aria-describedby="license-modal-body"
        onKeyDown={onKeyDown}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 id="license-modal-title" className="text-lg font-bold text-neutral-950">
              Acuerdo de licencia
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">{file.title}</p>
          </div>
          <button type="button" onClick={onCancel} className={ui.iconBtn} aria-label="Cerrar">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div
          id="license-modal-body"
          className="space-y-3 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-neutral-600"
        >
          {children ?? (
            <>
              {/* Texto de ejemplo: revisarlo con el área legal antes de publicar. */}
              <p>
                El firmware y los materiales de esta descarga son propiedad de su fabricante y se entregan bajo
                su licencia de uso.
              </p>
              <p>Al continuar, usted acepta:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Usar el archivo únicamente en equipos compatibles con este modelo.</li>
                <li>No modificar, revender ni redistribuir el archivo.</li>
                <li>
                  Que una actualización incorrecta o interrumpida puede dejar el equipo inoperativo; se recomienda
                  hacerla con apoyo de soporte técnico.
                </li>
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={ui.btnOutline}>
            Cancelar
          </button>
          <button ref={acceptRef} type="button" onClick={() => onAccept(file)} className={ui.btnPrimary}>
            <DownloadIcon className="h-4 w-4" />
            Aceptar y descargar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}