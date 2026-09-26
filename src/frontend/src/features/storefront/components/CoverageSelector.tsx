import { useEffect, useRef, useState } from 'react'

export const COVERAGE_CITIES = [
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Cartagena',
] as const

type CoverageSelectorProps = {
  cities?: readonly string[]
  defaultCity?: string | null
}

/**
 * Header dropdown "Ciudades de cobertura" (demo, sin backend): the trigger
 * shows a location pin and the picked city (or the generic label), and the
 * list is a static array of demo cities. Picking a city only updates the
 * local state of the trigger. As the siblings of the mega menu did, Escape
 * and a click outside close the dropdown; the list stays in the DOM hidden
 * while closed so the options are always declared.
 */
export default function CoverageSelector({ cities = COVERAGE_CITIES, defaultCity = null }: CoverageSelectorProps) {
  const [open, setOpen] = useState(false)
  const [city, setCity] = useState<string | null>(defaultCity)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 text-slate-500 transition hover:text-[#CE0203]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" aria-hidden="true">
          <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <span className="text-xs font-bold text-slate-800">{city ?? 'Ciudades de cobertura'}</span>
      </button>
      <ul
        role="listbox"
        aria-label="Ciudades de cobertura"
        className={
          open
            ? 'absolute left-0 z-40 mt-2 w-52 rounded-[10px] border border-slate-200 bg-white py-2 shadow-lg'
            : 'hidden'
        }
      >
        {cities.map((option) => (
          <li key={option}>
            <button
              type="button"
              role="option"
              aria-selected={option === city}
              onClick={() => {
                setCity(option)
                setOpen(false)
              }}
              className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              {option}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
