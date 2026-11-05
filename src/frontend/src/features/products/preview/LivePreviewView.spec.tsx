import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { storefrontFixture } from './fixtures'
import { LivePreviewView, type LivePreviewViewProps } from './LivePreviewView'
import type { PreviewCaption } from './preview-model'

const caption: PreviewCaption = { title: 'Nombre del producto', text: 'Es el título grande de la ficha.', empty: false }

const render = (over: Partial<LivePreviewViewProps> = {}): string =>
  renderToStaticMarkup(
    <LivePreviewView preview={null} caption={caption} activeField={null} onSelectField={() => undefined} {...over} />,
  )

describe('LivePreviewView', () => {
  it('shows the heading and the note that the preview cannot be used to buy or open links', () => {
    const html = render()

    expect(html).toContain('Así lo ve el cliente')
    expect(html).toContain('Aquí no se puede comprar ni abrir enlaces.')
  })

  it('shows the caption title and text', () => {
    const html = render()

    expect(html).toContain('<strong>Nombre del producto</strong>')
    expect(html).toContain('Es el título grande de la ficha.')
  })

  it('marks an empty caption', () => {
    expect(render({ caption: { ...caption, empty: true } })).toContain('data-empty="true"')
    expect(render()).toContain('data-empty="false"')
  })

  it('shows a busy skeleton with its text while there is no preview', () => {
    const html = render()

    expect(html).toContain('Preparando la vista previa…')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('<iframe')
  })

  it('shows the frame instead of the skeleton when there is a preview', () => {
    const html = render({ preview: storefrontFixture })

    expect(html).toContain('<iframe')
    expect(html).not.toContain('Preparando la vista previa…')
  })
})
