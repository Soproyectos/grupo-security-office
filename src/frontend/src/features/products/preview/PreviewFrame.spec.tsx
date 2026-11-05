import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { storefrontFixture } from './fixtures'
import { PreviewFrame } from './PreviewFrame'

/** Server render only (no DOM): the storefront is portaled into the frame after mount, so only the frame markup is produced here. */
function render(activeField: 'name' | null = null): string {
  return renderToStaticMarkup(
    <PreviewFrame product={storefrontFixture} activeField={activeField} onSelectField={() => undefined} />,
  )
}

describe('PreviewFrame', () => {
  it('renders a titled, untabbable, script-free iframe with the frame document', () => {
    const html = render()

    expect(html).toContain('<iframe')
    expect(html).toContain('title="Vista previa de la ficha en la tienda"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('sandbox="allow-same-origin"')
    expect(html).toMatch(/srcdoc="[^"]*preview-root/i)
  })

  it('renders on the server for a full product without the storefront markup', () => {
    const html = render('name')

    expect(html).toContain('<iframe')
    expect(html).not.toContain('data-preview-field')
  })
})
