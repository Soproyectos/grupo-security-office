import { useEffect, useRef, useState } from 'react';

interface ScrollSpyOptions {
  /** Contenedor con scroll propio. Si es null/undefined se usa la ventana. */
  container?: HTMLElement | null;
  /** Distancia (px) desde el borde superior a partir de la cual una sección cuenta como activa. */
  offset?: number;
  /** Si es true, devuelve el primer id cuando ninguna sección ha llegado arriba todavía. */
  defaultToFirst?: boolean;
}

/**
 * Devuelve el id de la sección visible según la posición del scroll.
 * Equivalente al "scroll-spy" que Hikvision hace con jQuery, sin dependencias.
 */
export function useScrollSpy(
  ids: string[],
  { container, offset = 0, defaultToFirst = false }: ScrollSpyOptions = {},
): string | undefined {
  const [active, setActive] = useState<string | undefined>(defaultToFirst ? ids[0] : undefined);
  const key = ids.join('|');
  const lastActive = useRef(active);

  useEffect(() => {
    const target: HTMLElement | Window = container ?? window;
    let frame = 0;
    // Sections do not change while the spy is mounted: look them up once, not on every frame.
    const elements = ids.map((id) => [id, document.getElementById(id)] as const);

    const compute = () => {
      frame = 0;
      const baseTop = container ? container.getBoundingClientRect().top : 0;
      let current: string | undefined = defaultToFirst ? ids[0] : undefined;

      for (const [id, el] of elements) {
        if (!el) continue;
        const top = el.getBoundingClientRect().top - baseTop;
        if (top - offset <= 1) current = id;
      }

      // Al llegar al final del scroll, la última sección queda activa aunque sea corta.
      const atBottom = container
        ? container.scrollTop > 0 &&
          container.scrollTop + container.clientHeight >= container.scrollHeight - 2
        : window.scrollY > 0 &&
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && current !== undefined) current = ids[ids.length - 1];

      // Most frames do not change the active section: skip the state write (and its render).
      if (current === lastActive.current) return;
      lastActive.current = current;
      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };

    compute();
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, container, offset, defaultToFirst]);

  return active;
}