import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LibraryUpdateLayout from './LibraryUpdateLayout'

function render(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/commercial/library/update" element={<LibraryUpdateLayout />}>
          <Route index element={<p>CONTENIDO-CARGA</p>} />
          <Route path="products" element={<p>CONTENIDO-FICHAS</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('LibraryUpdateLayout', () => {
  it('conserva los destinos de carga y fichas sin añadir otra fila de navegación', () => {
    expect(render('/commercial/library/update')).toBe('<p>CONTENIDO-CARGA</p>')
    expect(render('/commercial/library/update/products')).toBe('<p>CONTENIDO-FICHAS</p>')
  })
})
