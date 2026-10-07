/**
 * Clases compartidas de la ficha de producto.
 * Para cambiar la marca (rojo/negro) basta con editar este archivo.
 * Se escriben como cadenas completas para que Tailwind las detecte.
 */
export const ui = {
  container: 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8',

  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2',
  btnPrimarySm:
    'inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2',
  btnOutline:
    'inline-flex items-center justify-center gap-2 rounded-full border border-neutral-900 bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2',
  iconBtn:
    'inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600',

  sectionTitle: 'text-center text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl',
  accent: 'text-red-600',
  accentBg: 'bg-red-600',
  langTag:
    'inline-flex items-center rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-neutral-600',
} as const;

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}