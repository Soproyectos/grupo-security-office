import { isSinglePriceSelectionValid, SINGLE_PRICE_EMPTY_MESSAGE, SINGLE_PRICE_TARIFFS, singlePriceBannerText } from './flow.utils'

interface Props {
  selected: readonly string[]
  disabled?: boolean
  onChange: (code: string, checked: boolean) => void
}

/** Tariff picker + warning shown when the file uses the single-price column. */
export default function SinglePriceSelector({ selected, disabled, onChange }: Props) {
  const valid = isSinglePriceSelectionValid(selected)
  return (
    <fieldset className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3" aria-label="Escalafones del precio único">
      <legend className="px-1 text-sm font-semibold text-[var(--color-text-primary)]">Elige los escalafones que reciben el precio único</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {SINGLE_PRICE_TARIFFS.map((code) => (
          <label key={code} className="flex min-h-[44px] items-center gap-2 text-sm sm:min-h-0">
            <input type="checkbox" checked={selected.includes(code)} disabled={disabled} onChange={(event) => onChange(code, event.target.checked)} />
            {code}
          </label>
        ))}
      </div>
      {valid
        ? <p role="note" className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg-subtle)] p-3 text-sm text-[var(--color-text-primary)]">{singlePriceBannerText(selected)}</p>
        : <p role="alert" className="text-sm text-[var(--color-error)]">{SINGLE_PRICE_EMPTY_MESSAGE}</p>}
    </fieldset>
  )
}
