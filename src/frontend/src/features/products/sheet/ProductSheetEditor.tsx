import { Alert } from '../../../components/ui'
import { FichaSection } from './FichaSection'
import { PDF_OPTIONAL_NOTICE } from './document-assets'
import { BadgesBlock } from './blocks/BadgesBlock'
import { FeaturesBlock } from './blocks/FeaturesBlock'
import { HighlightsBlock } from './blocks/HighlightsBlock'
import { IdentifiersBlock } from './blocks/IdentifiersBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { ModelsBlock } from './blocks/ModelsBlock'
import { ResourcesBlock } from './blocks/ResourcesBlock'
import { SaveBar } from './blocks/SaveBar'
import { SpecGroupsBlock } from './blocks/SpecGroupsBlock'
import { StoreBlock } from './blocks/StoreBlock'
import { WebAddressBlock } from './blocks/WebAddressBlock'
import { SheetDraftProvider, useSheetDraft, type ProductSheetEditorProps } from './SheetDraftContext'

export type { ProductSheetEditorProps } from './SheetDraftContext'

/** Same order as the public product page: header, highlights, features, models, specifications, resources. */
export const SHEET_SECTIONS = [
  { id: 'identidad', label: 'Encabezado' },
  { id: 'destacados', label: 'Destacados' },
  { id: 'caracteristicas', label: 'Características' },
  { id: 'modelos', label: 'Modelos disponibles' },
  { id: 'especificaciones', label: 'Especificaciones' },
  { id: 'documentos', label: 'Recursos' },
] as const

/** The sheet editor: the draft lives in SheetDraftProvider, the blocks read it from there. */
export function ProductSheetEditor(props: ProductSheetEditorProps) {
  return (
    <SheetDraftProvider {...props}>
      <SheetLayout />
    </SheetDraftProvider>
  )
}

/** Places each block in its section. Moving a block to another section only changes this file. */
function SheetLayout() {
  const { sheet, lifecycleStatus, hideNav, embedded, sectionProps, handleSubmit } = useSheetDraft()
  const publicHref = `/catalogo/productos/${sheet.productId}`

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate aria-label="Editor de la ficha del producto">
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">Ficha pública</h2>
            <p className="text-sm text-neutral-500">
              Lo que ve el cliente en la tienda. Estas secciones se guardan juntas con «Guardar ficha pública», al final.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a href={publicHref} target="_blank" rel="noreferrer" className="text-security-600 hover:text-security-700 underline">
              Ver ficha pública
            </a>
          </div>
        </div>
      )}

      {!embedded && lifecycleStatus && lifecycleStatus !== 'PUBLISHED' && (
        <Alert variant="warning">
          El producto aún no está publicado en la tienda: la ficha pública no se verá hasta publicarlo (sección «Publicar»).
        </Alert>
      )}

      {!hideNav && (
        <nav aria-label="Secciones de la ficha" className="flex gap-1 flex-wrap">
          {SHEET_SECTIONS.map((s) => (
            <a key={s.id} href={`#ficha-${s.id}`} className="px-3 py-1.5 text-xs rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50">
              {s.label}
            </a>
          ))}
        </nav>
      )}

      <FichaSection {...sectionProps} id="identidad" title="Encabezado" hint="Lo que el cliente ve primero. No cambia Datos generales.">
        <StoreBlock />
        <BadgesBlock />
        <ImageBlock />
        <WebAddressBlock />
        <IdentifiersBlock />
      </FichaSection>

      <FichaSection {...sectionProps} id="destacados" title="Destacados" hint="Puntos fuertes del producto: frases cortas junto a la imagen, en este orden. No fijan precio ni stock.">
        <HighlightsBlock />
      </FichaSection>

      <FichaSection {...sectionProps} id="caracteristicas" title="Características" hint="Íconos con texto breve que se muestran bajo el título.">
        <FeaturesBlock />
      </FichaSection>

      <FichaSection {...sectionProps} id="modelos" title="Modelos disponibles" hint="Referencias a las que aplica la ficha y el firmware.">
        <ModelsBlock />
      </FichaSection>

      <FichaSection {...sectionProps} id="especificaciones" title="Especificaciones" hint="Un grupo por tema, por ejemplo Video o Red. Elige un grupo para editar sus filas.">
        <SpecGroupsBlock />
      </FichaSection>

      <FichaSection {...sectionProps} id="documentos" title="Recursos" hint={`Lo que el cliente puede descargar. ${PDF_OPTIONAL_NOTICE}`}>
        <ResourcesBlock />
      </FichaSection>

      <SaveBar />
    </form>
  )
}
