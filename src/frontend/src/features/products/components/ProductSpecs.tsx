import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SpecGroup, SpecItem } from '../types';
import { cx, ui } from '../styles';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { prefersReducedMotion } from '../lib/motion';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface ProductSpecsProps {
  groups: SpecGroup[];
  disclaimer?: string;
  /** Alto total de lo que queda fijo arriba (header del sitio + subnav). */
  stickyTotal: number;
}

const desktopId = (id: string) => `spec-d-${id}`;
const mobileId = (id: string) => `spec-m-${id}`;

function SpecRows({ items, stacked = false }: { items: SpecItem[]; stacked?: boolean }) {
  return (
    <dl className="space-y-1">
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className={cx(
            'rounded-lg bg-neutral-100/80 px-4 py-3',
            stacked ? 'flex flex-col gap-1' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 px-5',
          )}
        >
          <dt className={cx('text-neutral-500', stacked ? 'text-xs font-medium' : 'text-sm')}>{item.label}</dt>
          <dd className="whitespace-pre-line text-sm leading-relaxed text-neutral-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* Escritorio: menú lateral fijo + grupos que fluyen con la página      */
/* ------------------------------------------------------------------ */

/*
 * The groups used to live in a 680px panel with its own scrollbar and `overscroll-contain`.
 * While the cursor was over it the mouse wheel scrolled the panel instead of the page and
 * never chained to it, which felt like the page "got stuck". Now the page is the only
 * scroller: the menu is sticky and the groups flow with the page.
 */
function DesktopSpecs({ groups, stickyTotal }: { groups: SpecGroup[]; stickyTotal: number }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const pinTimer = useRef<number | undefined>(undefined);
  const menuTop = stickyTotal + 16;

  const spied = useScrollSpy(groups.map((g) => desktopId(g.id)), {
    offset: stickyTotal + 32,
    defaultToFirst: true,
  });
  const active = pinned ?? spied;

  useEffect(() => () => window.clearTimeout(pinTimer.current), []);

  const select = (id: string) => {
    const target = document.getElementById(desktopId(id));
    if (!target) return;
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    // Mientras dura la animación, el ítem pulsado se mantiene activo.
    setPinned(desktopId(id));
    window.clearTimeout(pinTimer.current);
    pinTimer.current = window.setTimeout(() => setPinned(null), 700);
  };

  return (
    <div className="hidden lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <nav
        aria-label="Categorías de especificaciones"
        className="sticky overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 py-4"
        style={{ top: menuTop, maxHeight: `calc(100vh - ${menuTop + 16}px)` }}
      >
        <ul>
          {groups.map((g) => {
            const isActive = active === desktopId(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => select(g.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cx(
                    'flex w-full items-center gap-3 px-6 py-3 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600',
                    isActive
                      ? 'bg-white font-semibold text-neutral-950'
                      : 'text-neutral-500 hover:bg-white/60 hover:text-neutral-900',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
                      isActive ? 'bg-red-600' : 'bg-transparent',
                    )}
                  />
                  {g.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div role="region" aria-label="Detalle de especificaciones" className="rounded-2xl border border-neutral-200 bg-white px-8 pb-8">
        {groups.map((g) => (
          <section
            key={g.id}
            id={desktopId(g.id)}
            aria-labelledby={`${desktopId(g.id)}-title`}
            className="pt-8"
            style={{ scrollMarginTop: menuTop }}
          >
            <h3 id={`${desktopId(g.id)}-title`} className="mb-4 text-lg font-bold text-neutral-950">
              {g.title}
            </h3>
            <SpecRows items={g.items} />
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Móvil: chips + carrusel deslizable con scroll-snap (sin Swiper)      */
/* ------------------------------------------------------------------ */

function MobileSpecs({ groups }: { groups: SpecGroup[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState<number>();
  // Mientras dura un desplazamiento programático no se recalcula el índice (evita saltos).
  const lockUntil = useRef(0);

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(groups.length - 1, i));
    lockUntil.current = Date.now() + 700;
    setIndex(next);
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  }, [groups.length]);

  // Índice activo según el desplazamiento horizontal (cuando el usuario desliza).
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0 || Date.now() < lockUntil.current) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index) setIndex(i);
  };

  // El carrusel toma el alto de la tarjeta activa (evita huecos con grupos cortos).
  useLayoutEffect(() => {
    const measure = () => setHeight(cardRefs.current[index]?.offsetHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [index]);

  // Mantiene visible el chip activo.
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.children[index] as HTMLElement | undefined;
    if (!row || !chip) return;
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.clientWidth) / 2, behavior: 'smooth' });
  }, [index]);

  return (
    <div className="lg:hidden">
      <div
        ref={chipsRef}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => goTo(i)}
            aria-current={i === index ? 'true' : undefined}
            aria-controls={mobileId(g.id)}
            className={cx(
              'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600',
              i === index
                ? 'border-neutral-950 bg-neutral-950 text-white'
                : 'border-neutral-300 bg-white text-neutral-700',
            )}
          >
            {g.title}
          </button>
        ))}
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        aria-roledescription="carrusel"
        aria-label="Especificaciones"
        className="mt-4 flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] transition-[height] duration-300 [&::-webkit-scrollbar]:hidden"
        style={{ height }}
      >
        {groups.map((g, i) => (
          <section
            key={g.id}
            id={mobileId(g.id)}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${groups.length}: ${g.title}`}
            className="w-full shrink-0 snap-start snap-always"
          >
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h3 className="mb-3 text-base font-bold text-neutral-950">{g.title}</h3>
              <SpecRows items={g.items} stacked />
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className={cx(ui.iconBtn, 'border border-neutral-300 disabled:opacity-40')}
          aria-label="Categoría anterior"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium text-neutral-500" aria-live="polite">
          <span className="text-red-600">{index + 1}</span> / {groups.length}
        </span>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === groups.length - 1}
          className={cx(ui.iconBtn, 'border border-neutral-300 disabled:opacity-40')}
          aria-label="Categoría siguiente"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ProductSpecs({ groups, disclaimer, stickyTotal }: ProductSpecsProps) {
  if (groups.length === 0) return null;
  return (
    <div>
      <DesktopSpecs groups={groups} stickyTotal={stickyTotal} />
      <MobileSpecs groups={groups} />
      {disclaimer && <p className="mt-4 text-xs leading-relaxed text-neutral-400">* {disclaimer}</p>}
    </div>
  );
}