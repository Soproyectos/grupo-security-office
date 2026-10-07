import type { MouseEvent } from 'react';
import type { DownloadHandler, ProductDetail } from '../types';
import { cx, ui } from '../styles';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { prefersReducedMotion } from '../lib/motion';
import { DownloadIcon } from './icons';

export interface SubnavSection {
  id: string;
  label: string;
}

interface ProductSubnavProps {
  product: ProductDetail;
  sections: SubnavSection[];
  /** Alto (px) del header fijo del sitio, si existe. */
  stickyOffset: number;
  height: number;
  onDownload?: DownloadHandler;
}

/**
 * Barra fija con el modelo, accesos a las secciones y botón de ficha técnica.
 * Resalta la sección visible (scroll-spy) igual que la barra de Hikvision.
 */
export function ProductSubnav({ product, sections, stickyOffset, height, onDownload }: ProductSubnavProps) {
  const active = useScrollSpy(
    sections.map((s) => s.id),
    { offset: stickyOffset + height + 24 },
  );
  const datasheet = product.documents.find((d) => d.type === 'datasheet');

  const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div
      className="sticky z-30 border-b border-neutral-200 bg-white"
      style={{ top: stickyOffset }}
    >
      <div className={cx(ui.container, 'flex items-center gap-4')} style={{ height }}>
        <span className="hidden min-w-0 shrink truncate text-sm font-bold text-neutral-950 md:block md:w-56">
          {product.model}
        </span>

        <nav aria-label="Secciones del producto" className="flex flex-1 justify-start md:justify-center">
          <ul className="flex h-full items-stretch gap-6">
            {sections.map((s) => {
              const isActive = active === s.id;
              return (
                <li key={s.id} className="flex">
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => goTo(e, s.id)}
                    aria-current={isActive ? 'location' : undefined}
                    className={cx(
                      'relative flex items-center text-sm transition-colors',
                      'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
                      isActive
                        ? 'font-semibold text-red-600 after:bg-red-600'
                        : 'text-neutral-700 after:bg-transparent hover:text-neutral-950',
                    )}
                    style={{ height }}
                  >
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 justify-end md:w-56">
          {datasheet && (
            <a
              href={datasheet.url}
              target="_blank"
              rel="noopener noreferrer"
              className={ui.btnPrimarySm}
              onClick={() =>
                onDownload?.({ id: datasheet.id, title: datasheet.title, url: datasheet.url, kind: datasheet.type })
              }
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ficha técnica</span>
              <span className="sm:hidden">PDF</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}