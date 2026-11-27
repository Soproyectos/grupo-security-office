import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { get, post, patch, put, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }))
vi.mock('../../services/api', () => ({ default: { get, post, patch, put, delete: del }, resolveAssetUrl: (path?: string | null) => path ?? '' }))

import BannersTab from './BannersTab'
import { canLeave } from './unsaved-guard'
import Drawer from '../../components/ui/Drawer'
import { nextFocusIndex } from '../../components/ui/drawer-focus'
import CampaignEditor from './CampaignEditor'
import MarketingLayout from './MarketingLayout'
import CampaignPreview from './CampaignPreview'
import { PREVIEW_CANVAS_WIDTH, draftToCampaigns, emptyPreviewText, previewScale } from './marketing-rules'
import { readLayoutMessage, readPreviewMessage } from '../storefront/utils/preview-frame'
import { campaignsKey, type CampaignDetail, type CampaignSummary } from './marketing-api'
import { hasMarketingAction, marketingPermissions, MARKETING_PAGES, visibleMarketingPages, type MarketingPermissions } from './marketing-access'
import { userAccessKey } from '../users/access'
import { useAuthStore } from '../../stores/auth.store'
import type { AccessGrant } from '../../services/users.service'

const ALL: MarketingPermissions = { read: true, create: true, edit: true, publish: true, delete: true, images: true }
const READ_ONLY: MarketingPermissions = { read: true, create: false, edit: false, publish: false, delete: false, images: false }

function summary(over: Partial<CampaignSummary>): CampaignSummary {
  return {
    id: 'c1', revision: 1, kind: 'HERO', name: 'Banner de prueba', alt: 'Cámara', linkUrl: null, position: 0, startsAt: null, endsAt: null,
    fit: 'cover', focusX: 50, focusY: 50, hasImageDesktop: true, hasImageMobile: false, hasImage: false,
    status: 'DRAFT', hasPublished: false, hasUnpublishedChanges: false, validity: null, isLive: false,
    createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z', ...over,
  }
}

function detail(over: Partial<CampaignSummary> = {}, kind: 'HERO' | 'POPUP' = 'HERO'): CampaignDetail {
  const base = summary({ kind, ...over })
  return {
    ...base,
    draft: {
      kind, name: base.name, alt: base.alt, linkUrl: null, position: base.position, startsAt: null, endsAt: null, fit: base.fit,
      focusX: base.focusX, focusY: base.focusY, imageDesktop: 'data:image/png;base64,AAAA', imageMobile: null, image: kind === 'POPUP' ? 'data:image/png;base64,BBBB' : null,
    },
  }
}

function grants(actions: string[]): AccessGrant[] {
  return actions.map((action) => ({ sourceId: 's1', actionId: `marketing:${action}`, scope: 'global' }))
}

function login(roles: string[]) {
  const session = { isAuthenticated: true, user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions: [] } }
  useAuthStore.setState(session as never)
  Object.assign(useAuthStore.getInitialState(), session)
}

function client(list?: CampaignSummary[], access?: AccessGrant[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (list) qc.setQueryData(campaignsKey, list)
  if (access) qc.setQueryData(userAccessKey('u1'), { catalogVersion: 'v1', accessVersion: 1, grants: access, sources: [] })
  return qc
}

function renderTab(list: CampaignSummary[] | undefined, access: AccessGrant[]) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client(list, access)}><MemoryRouter><BannersTab /></MemoryRouter></QueryClientProvider>,
  )
}

function renderPreview(d: CampaignDetail, device?: 'desktop' | 'mobile') {
  return renderToStaticMarkup(
    <CampaignPreview kind={d.draft.kind} alt={d.draft.alt} fit={d.draft.fit} focusX={d.draft.focusX} focusY={d.draft.focusY}
      imageDesktop={d.draft.imageDesktop} imageMobile={d.draft.imageMobile} image={d.draft.image} initialDevice={device ?? 'desktop'} />,
  )
}

function renderEditor(d: CampaignDetail | null, permissions: MarketingPermissions, kind: 'HERO' | 'POPUP' = 'HERO', initialFramingDevice?: 'desktop' | 'mobile') {
  return renderToStaticMarkup(
    <QueryClientProvider client={client()}>
      <CampaignEditor kind={kind} detail={d} permissions={permissions} onSaved={() => undefined} onClose={() => undefined} onReload={async () => undefined} initialFramingDevice={initialFramingDevice} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); patch.mockReset(); put.mockReset(); del.mockReset()
  login(['Consulta'])
})

describe('acceso al panel', () => {
  it('solo cuenta marketing:* asignado con alcance global; Super Admin siempre', () => {
    const read = [{ actionId: 'marketing:read', scope: 'global' as const }]
    expect(hasMarketingAction({ roles: [], grants: read, status: 'ready' }, 'read')).toBe(true)
    expect(hasMarketingAction({ roles: [], grants: [{ actionId: 'marketing:read', scope: 'team' }], status: 'ready' }, 'read')).toBe(false)
    expect(hasMarketingAction({ roles: [], grants: read, status: 'loading' }, 'read')).toBe(false)
    expect(hasMarketingAction({ roles: [], grants: read, status: 'unavailable' }, 'read')).toBe(false)
    expect(hasMarketingAction({ roles: ['Super Admin'], grants: [], status: 'unavailable' }, 'delete')).toBe(true)
  })
  it('la acción suelta abre el panel sin ningún paquete ni rol; otra acción de marketing no la reemplaza', () => {
    const read = [{ actionId: 'marketing:read', scope: 'global' as const }]
    expect(hasMarketingAction({ roles: [], grants: read, status: 'ready' }, 'read')).toBe(true)
    expect(hasMarketingAction({ roles: ['Vendedor'], grants: read, status: 'ready' }, 'read')).toBe(true)
    expect(hasMarketingAction({ roles: ['Vendedor'], grants: [{ actionId: 'marketing:publish', scope: 'global' }], status: 'ready' }, 'read')).toBe(false)
    expect(hasMarketingAction({ roles: ['Vendedor'], grants: [{ actionId: 'commercialPromotions:read', scope: 'team' }], status: 'ready' }, 'read')).toBe(false)
  })
  it('cada acción de marketing abre solo su permiso', () => {
    for (const action of ['read', 'create', 'edit', 'publish', 'delete'] as const) {
      const permissions = marketingPermissions({ roles: [], grants: grants([action]), status: 'ready' })
      expect(permissions[action], action).toBe(true)
    }
  })
  it('subir imágenes pide crear o editar', () => {
    expect(marketingPermissions({ roles: [], grants: grants(['read', 'edit']), status: 'ready' }).images).toBe(true)
    expect(marketingPermissions({ roles: [], grants: grants(['read', 'publish']), status: 'ready' }).images).toBe(false)
  })
  it('el panel tiene tres pestañas, en orden, con icono y ayuda', () => {
    expect(MARKETING_PAGES.map((page) => page.label)).toEqual(['Banners', 'Promociones internas', 'Gestionar avisos'])
    expect(MARKETING_PAGES.map((page) => page.to)).toEqual(['/marketing/banners', '/marketing/promotions', '/marketing/notices'])
    for (const page of MARKETING_PAGES) {
      expect(page.icon.length).toBeGreaterThan(0)
      expect(page.hint.length).toBeGreaterThan(0)
    }
  })
  it('cada pestaña conserva la acción que exigía antes de moverse', () => {
    expect(MARKETING_PAGES.map((page) => page.actionId)).toEqual(['marketing:read', 'commercialPromotions:read', 'commercialPromotions:create'])
  })
})

describe('pestañas visibles', () => {
  const labels = (input: Parameters<typeof visibleMarketingPages>[0]) => visibleMarketingPages(input).map((page) => page.label)
  const promo = (...actions: string[]) => actions.map((action) => ({ actionId: `commercialPromotions:${action}`, scope: 'team' as const }))
  it('Super Admin ve las tres, aunque el acceso no cargue', () => {
    expect(labels({ roles: ['Super Admin'], grants: [], status: 'unavailable' })).toEqual(['Banners', 'Promociones internas', 'Gestionar avisos'])
  })
  it('quien solo tiene promociones ve sus pestañas y no Banners', () => {
    expect(labels({ roles: [], grants: promo('read'), status: 'ready' })).toEqual(['Promociones internas'])
    expect(labels({ roles: [], grants: promo('create'), status: 'ready' })).toEqual(['Gestionar avisos'])
    expect(labels({ roles: [], grants: promo('read', 'create'), status: 'ready' })).toEqual(['Promociones internas', 'Gestionar avisos'])
  })
  it('quien solo tiene banners ve Banners y ninguna pestaña de avisos', () => {
    expect(labels({ roles: [], grants: grants(['read']), status: 'ready' })).toEqual(['Banners'])
  })
  it('editar o publicar avisos sin crear no abre Gestionar avisos', () => {
    expect(labels({ roles: [], grants: promo('edit', 'publish', 'withdraw'), status: 'ready' })).toEqual([])
  })
  it('cargando o con error no recupera pestañas', () => {
    expect(labels({ roles: [], grants: promo('read', 'create'), status: 'loading' })).toEqual([])
    expect(labels({ roles: [], grants: promo('read', 'create'), status: 'unavailable' })).toEqual([])
  })
  it('sin ninguna acción no hay pestañas', () => {
    expect(labels({ roles: ['Consulta'], grants: [], status: 'ready' })).toEqual([])
  })
})

describe('MarketingLayout', () => {
  const html = (access: AccessGrant[], path = '/marketing/banners') => renderToStaticMarkup(
    <QueryClientProvider client={client(undefined, access)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/marketing" element={<MarketingLayout />}>
          <Route path="banners" element={<p>DATOS-BANNERS</p>} />
          <Route path="promotions" element={<p>DATOS-PROMOCIONES</p>} />
          <Route path="notices" element={<p>DATOS-AVISOS</p>} />
        </Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const promoGrants = (...actions: string[]): AccessGrant[] => actions.map((action) => ({ sourceId: 's1', actionId: `commercialPromotions:${action}`, scope: 'team' }))
  it('con marketing:read muestra la barra con Banners activa, su ayuda y no «Campañas»', () => {
    const out = html(grants(['read']))
    expect(out).toContain('biblioteca-workspace__bar')
    expect(out).toContain('>Marketing y mercadeo</h1>')
    expect(out).toContain('aria-label="Navegación de Marketing"')
    expect(out).toMatch(/aria-current="page"[^>]*href="\/marketing\/banners"/)
    expect(out).toContain('Imágenes de la portada de la tienda y ventana emergente.')
    expect(out).not.toContain('href="/marketing/promotions"')
    expect(out).not.toContain('href="/marketing/notices"')
    expect(out).not.toContain('Campañas')
    expect(out).toContain('DATOS-BANNERS')
  })
  it('Super Admin ve las tres pestañas en orden y la activa sigue la ruta', () => {
    login(['Super Admin'])
    const out = html([], '/marketing/notices')
    const order = ['/marketing/banners', '/marketing/promotions', '/marketing/notices']
    const positions = order.map((href) => out.indexOf(`href="${href}"`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(out).toMatch(/aria-current="page"[^>]*href="\/marketing\/notices"/)
    expect(out).toContain('Crea, publica y retira avisos para el equipo.')
    expect(out).toContain('DATOS-AVISOS')
  })
  it('quien solo tiene promociones ve su pestaña y su página, sin Banners', () => {
    const out = html(promoGrants('read'), '/marketing/promotions')
    expect(out).toContain('href="/marketing/promotions"')
    expect(out).toMatch(/aria-current="page"[^>]*href="\/marketing\/promotions"/)
    expect(out).toContain('Avisos vigentes para consultar antes de cotizar.')
    expect(out).not.toContain('href="/marketing/banners"')
    expect(out).not.toContain('href="/marketing/notices"')
    expect(out).toContain('DATOS-PROMOCIONES')
    expect(out).not.toContain('Sin acceso a este panel')
  })
  it('con solo las acciones de marketing asignadas monta Banners, sin ningún paquete', () => {
    const out = html(grants(['read', 'create', 'edit', 'publish', 'delete']))
    expect(out).not.toContain('Sin acceso a este panel')
    expect(out).toContain('DATOS-BANNERS')
    expect(out).toContain('href="/marketing/banners"')
  })
  it('con una acción de marketing de otro alcance que no sea global no monta Banners', () => {
    const out = html([{ sourceId: 's1', actionId: 'marketing:read', scope: 'own' }])
    expect(out).toContain('Sin acceso a este panel')
    expect(out).not.toContain('DATOS-BANNERS')
  })
  it('sin marketing:read ni avisos no monta el contenido ni pinta pestañas', () => {
    const out = html(grants(['edit']))
    expect(out).toContain('Sin acceso a este panel')
    expect(out).not.toContain('DATOS-BANNERS')
    expect(out).not.toContain('biblioteca-workspace__nav')
  })
})

describe('página Banners', () => {
  it('muestra las dos tarjetas y el vacío con permiso de crear', () => {
    const out = renderTab([], grants(['read', 'create']))
    expect(out).toContain('Banners de inicio')
    expect(out).not.toContain('Banner del título')
    expect(out).toContain('Pop-up')
    expect(out).toContain('Aún no hay banners. Crea el primero.')
    expect(out).toContain('Nuevo banner')
    expect(out).toContain('Nuevo pop-up')
  })
  it('sin permiso de crear no ofrece crear ni invita a hacerlo', () => {
    const out = renderTab([], grants(['read']))
    expect(out).toContain('Aún no hay banners.')
    expect(out).not.toContain('Crea el primero')
    expect(out).not.toContain('Nuevo banner')
    expect(out).not.toContain('Nuevo pop-up')
  })
  it('lista por orden con etiquetas de estado', () => {
    const out = renderTab([
      summary({ id: 'b', name: 'Segundo', position: 2, status: 'PUBLISHED', validity: 'ACTIVE' }),
      summary({ id: 'a', name: 'Primero', position: 1 }),
      summary({ id: 'c', name: 'Con cambios', position: 3, status: 'PUBLISHED', validity: 'ACTIVE', hasUnpublishedChanges: true }),
      summary({ id: 'd', name: 'Futuro', position: 4, status: 'PUBLISHED', validity: 'SCHEDULED' }),
      summary({ id: 'e', name: 'Pasado', position: 5, status: 'PUBLISHED', validity: 'EXPIRED' }),
      summary({ id: 'p', kind: 'POPUP', name: 'Ventana', hasImage: true }),
    ], grants(['read', 'edit']))
    expect(out.indexOf('Primero')).toBeLessThan(out.indexOf('Segundo'))
    for (const label of ['Borrador', 'Publicado', 'Programado', 'Vencido', 'Publicado con cambios sin publicar']) expect(out).toContain(label)
    expect(out).toContain('Ventana')
    expect(out).toContain('Editar')
  })
  it('cada tarjeta muestra cuántos hay publicados y el límite', () => {
    const out = renderTab([
      summary({ id: 'a', name: 'Uno', status: 'PUBLISHED', validity: 'ACTIVE' }),
      summary({ id: 'b', name: 'Dos' }),
      summary({ id: 'p', kind: 'POPUP', name: 'Ventana', status: 'PUBLISHED', validity: 'ACTIVE' }),
    ], grants(['read']))
    expect(out).toContain('Publicados: 1 de 6 permitidos')
    expect(out).toContain('Publicados: 1 de 1 permitido')
  })
  it('ya no edita dentro de la página: el formulario solo vive en el panel lateral', () => {
    const out = renderTab([summary({ name: 'Uno' })], grants(['read', 'edit', 'create']))
    expect(out).not.toContain('role="dialog"')
    expect(out).not.toContain('<form')
  })
  it('sin permiso de editar el botón dice Ver', () => {
    const out = renderTab([summary({ name: 'Solo lectura' })], grants(['read']))
    expect(out).toContain('aria-label="Ver Solo lectura"')
    expect(out).not.toContain('aria-label="Editar Solo lectura"')
  })
  it('cargando muestra el estado de carga y sin lectura no pide nada', () => {
    expect(renderTab(undefined, grants(['read']))).toContain('Cargando banners…')
    expect(renderTab(undefined, [])).toContain('No tienes permiso para ver los banners.')
  })
})

describe('formulario de banner', () => {
  it('muestra la guía de medidas de escritorio y móvil con las cifras exactas', () => {
    const out = renderEditor(detail(), ALL)
    expect(out).toContain('1200 × 520 px recomendado · ancho mínimo 1000 px · proporción entre 2.0 y 2.6 · máximo 3 MB · PNG, JPEG o WebP')
    expect(out).toContain('900 × 675 px recomendado · ancho mínimo 600 px · proporción entre 1.2 y 1.5')
    expect(out).not.toContain('Vista previa')
    expect(out).toContain('Foco horizontal')
    expect(out).toContain('Ajuste de la imagen')
    expect(out).toContain('Texto alternativo')
  })
  it('el encuadre tiene pestañas Escritorio y Móvil; empieza en Escritorio', () => {
    const out = renderEditor(detail(), ALL)
    expect(out).toMatch(/aria-pressed="true"[^>]*>Escritorio</)
    expect(out).toMatch(/aria-pressed="false"[^>]*>Móvil</)
    expect(out).toContain('id="hero-fit"')
    expect(out).not.toContain('id="hero-fit-mobile"')
  })
  it('el bloque Móvil tiene ajuste y focos propios, con su ayuda, y avisa si no hay imagen de móvil', () => {
    const out = renderEditor(detail({ fit: 'contain', focusX: 20, focusY: 80 }), ALL, 'HERO', 'mobile')
    expect(out).toContain('id="hero-fit-mobile"')
    expect(out).toContain('Foco horizontal (móvil): 20 %')
    expect(out).toContain('Foco vertical (móvil): 80 %')
    expect(out).toContain('Aplica a la imagen de móvil. Si no subes imagen de móvil, el móvil usa la de escritorio y estos valores se ignoran: se usan los de escritorio.')
    expect(out).toContain('Todavía no hay imagen de móvil')
    expect(out).not.toContain('id="hero-fit"')
  })
  it('una campaña con encuadre móvil propio lo muestra, sin el aviso si ya hay imagen de móvil', () => {
    const d = detail({ fit: 'cover', focusX: 20 })
    const withMobile = { ...d, draft: { ...d.draft, imageMobile: 'data:image/png;base64,MMMM', fitMobile: 'contain' as const, focusMobileX: 75, focusMobileY: 10 } }
    const out = renderEditor(withMobile, ALL, 'HERO', 'mobile')
    expect(out).toContain('Foco horizontal (móvil): 75 %')
    expect(out).toContain('Foco vertical (móvil): 10 %')
    expect(out).toMatch(/<option value="contain" selected/)
    expect(out).not.toContain('Todavía no hay imagen de móvil')
  })
  it('un banner nuevo pide guardar el borrador antes de subir imágenes', () => {
    const out = renderEditor(null, ALL)
    expect(out).toContain('Nuevo banner')
    expect(out).toContain('Guarda el borrador para poder subir la imagen')
    expect(out).not.toContain('type="file"')
  })
  it('borrador con todos los permisos: guardar, publicar, eliminar y subir', () => {
    const out = renderEditor(detail(), ALL)
    expect(out).toContain('Guardar cambios')
    expect(out).toContain('>Publicar<')
    expect(out).toContain('Eliminar borrador')
    expect(out).toContain('type="file"')
    expect(out).not.toContain('Retirar de la tienda')
  })
  it('publicado: ofrece retirar y publicar cambios, nunca eliminar', () => {
    const out = renderEditor(detail({ status: 'PUBLISHED', validity: 'ACTIVE', hasUnpublishedChanges: true }), ALL)
    expect(out).toContain('Retirar de la tienda')
    expect(out).toContain('Publicar cambios')
    expect(out).not.toContain('Eliminar borrador')
  })
  it('sin permisos oculta los botones y dice por qué', () => {
    const out = renderEditor(detail(), READ_ONLY)
    for (const text of ['Guardar cambios', '>Publicar<', 'Eliminar borrador', 'Retirar de la tienda', 'Quitar imagen', 'type="file"']) expect(out).not.toContain(text)
    expect(out).toContain('Solo puedes ver este banner')
    expect(out).toContain('Tu cuenta no tiene permiso para subir imágenes.')
  })
  it('cada permiso controla solo su botón', () => {
    const only = (p: Partial<MarketingPermissions>) => renderEditor(detail(), { ...READ_ONLY, ...p })
    expect(only({ edit: true })).toContain('Guardar cambios')
    expect(only({ edit: true })).not.toContain('>Publicar<')
    expect(only({ publish: true })).toContain('>Publicar<')
    expect(only({ publish: true })).not.toContain('Guardar cambios')
    expect(only({ delete: true })).toContain('Eliminar borrador')
    expect(only({ delete: true })).not.toContain('>Publicar<')
    expect(only({ images: true })).toContain('type="file"')
  })
})

describe('textos de ayuda', () => {
  it('cada campo del banner tiene su ayuda enlazada con aria-describedby', () => {
    const out = renderEditor(detail(), ALL)
    for (const field of ['name', 'alt', 'link', 'position', 'starts', 'ends', 'fit', 'focus-x', 'focus-y', 'file-desktop', 'file-mobile']) {
      expect(out).toContain(`id="hero-${field}-help"`)
      expect(out).toContain(`aria-describedby="hero-${field}-help"`)
    }
    expect(out).toContain('0 % = lado izquierdo, 50 % = centro, 100 % = lado derecho')
    expect(out).toContain('0 % = arriba, 50 % = centro, 100 % = abajo')
    expect(out).toContain('llena todo el espacio')
    expect(out).toContain('si no la subes, el móvil usa la de escritorio')
  })
  it('el pop-up tiene ayuda de imagen y no la de orden ni foco', () => {
    const out = renderEditor(detail({}, 'POPUP'), ALL, 'POPUP')
    expect(out).toContain('id="popup-file-image-help"')
    expect(out).toContain('id="popup-alt-help"')
    expect(out).not.toContain('popup-position-help')
    expect(out).not.toContain('popup-focus-x-help')
  })
})

describe('panel lateral (Drawer)', () => {
  const drawer = (open: boolean) => renderToStaticMarkup(
    <Drawer open={open} onClose={() => undefined} title="Editar banner"><button type="button">Dentro</button></Drawer>,
  )
  it('cerrado no pinta nada', () => {
    expect(drawer(false)).toBe('')
  })
  it('abierto es un diálogo modal con título enlazado, fondo clicable y 560 px en escritorio', () => {
    const out = drawer(true)
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-modal="true"')
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(out)?.[1]
    expect(labelledBy).toBeTruthy()
    expect(out).toContain(`id="${labelledBy}"`)
    expect(out).toContain('>Editar banner<')
    expect(out).toContain('data-testid="drawer-backdrop"')
    expect(out).toContain('md:w-[560px]')
    expect(out).toContain('w-full')
    expect(out).toContain('aria-label="Cerrar panel"')
  })
  it('abrir un banner muestra el formulario con la ayuda del foco dentro del diálogo', () => {
    const out = renderToStaticMarkup(
      <QueryClientProvider client={client()}>
        <Drawer open onClose={() => undefined} title="Editar banner">
          <CampaignEditor kind="HERO" detail={detail()} permissions={ALL} onSaved={() => undefined} onClose={() => undefined} onReload={async () => undefined} />
        </Drawer>
      </QueryClientProvider>,
    )
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-label="Editar banner"')
    expect(out).toContain('Foco horizontal: 50 %')
    expect(out).toContain('Solo se nota si la imagen se recorta')
  })
  it('el Tab da la vuelta al llegar al último o al primero', () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0)
    expect(nextFocusIndex(3, 0, true)).toBe(2)
    expect(nextFocusIndex(3, 1, false)).toBe(2)
    expect(nextFocusIndex(3, -1, false)).toBe(0)
    expect(nextFocusIndex(3, -1, true)).toBe(2)
    expect(nextFocusIndex(0, -1, false)).toBe(-1)
  })
})

describe('cerrar con cambios sin guardar', () => {
  it('sin cambios cierra sin preguntar', () => {
    const ask = vi.fn(() => false)
    expect(canLeave(false, ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })
  it('con cambios pregunta y respeta la respuesta', () => {
    const ask = vi.fn(() => false)
    expect(canLeave(true, ask)).toBe(false)
    expect(ask).toHaveBeenCalledWith('Hay cambios sin guardar. ¿Salir sin guardarlos?')
    expect(canLeave(true, () => true)).toBe(true)
  })
})

describe('formulario de pop-up', () => {
  it('muestra la guía de 900 × 900, solo la imagen y no pide título, orden ni foco', () => {
    const out = renderEditor(detail({}, 'POPUP'), ALL, 'POPUP')
    expect(out).toContain('900 × 900 px recomendado · ancho mínimo 600 px · proporción entre 0.6 y 1.8 · máximo 3 MB · PNG, JPEG o WebP')
    expect(out).not.toContain('Vista previa del pop-up')
    expect(out).toContain('Imagen del pop-up')
    expect(out).not.toContain('Orden (menor primero)')
    expect(out).not.toContain('Foco horizontal')
    expect(out).not.toContain('900 × 675')
    expect(out).toContain('Texto alternativo')
  })
})

describe('vista previa en el área izquierda', () => {
  const drawerWithAside = () => renderToStaticMarkup(
    <Drawer open onClose={() => undefined} title="Editar banner" aside={<p>CONTENIDO-ASIDE</p>}><button type="button">Dentro</button></Drawer>,
  )
  it('el Drawer pinta el aside; sin ser pantalla ancha va arriba del formulario, dentro del panel de 560 px', () => {
    const out = drawerWithAside()
    expect(out).toContain('CONTENIDO-ASIDE')
    expect(out).toContain('data-testid="drawer-aside"')
    expect(out.indexOf('CONTENIDO-ASIDE')).toBeLessThan(out.indexOf('Dentro'))
    expect(out.indexOf('role="dialog"')).toBeLessThan(out.indexOf('CONTENIDO-ASIDE'))
    expect(out).toContain('md:w-[560px]')
    expect(out).toContain('data-testid="drawer-backdrop"')
  })
  it('sin aside no pinta ese bloque', () => {
    expect(renderToStaticMarkup(<Drawer open onClose={() => undefined} title="x"><p>a</p></Drawer>)).not.toContain('drawer-aside')
  })
  it('el editor ya no lleva la vista previa dentro del formulario', () => {
    for (const kind of ['HERO', 'POPUP'] as const) {
      const out = renderEditor(detail({}, kind), ALL, kind)
      expect(out).not.toContain('Vista previa')
      expect(out).not.toContain('<iframe')
    }
  })
  it('la vista previa es la portada real en un iframe no interactivo, con selector Escritorio / Móvil', () => {
    const out = renderPreview(detail())
    expect(out).toContain('Vista previa: así se verá hoy en la tienda')
    expect(out).toContain('<iframe')
    expect(out).toContain('src="/tienda?vista-previa-campana=1"')
    expect(out).toContain('role="region"')
    expect(out).toContain('aria-label="Vista previa de la tienda, solo lectura"')
    expect(out).toContain('tabindex="0"')
    expect(out).not.toContain('pointer-events-none')
    expect(out).toContain('width:1280px')
    expect(out).toMatch(/aria-pressed="true"[^>]*>Escritorio</)
    expect(out).toMatch(/aria-pressed="false"[^>]*>Móvil</)
    expect(out).not.toContain('data-testid="preview-empty"')
  })
  it('en Móvil el lienzo mide 390 px y el pop-up no lleva selector ajeno', () => {
    expect(renderPreview(detail(), 'mobile')).toContain('width:390px')
    expect(renderPreview(detail({}, 'POPUP'))).toContain('aria-label="Vista previa del pop-up"')
  })
  it('estado vacío: texto y medidas recomendadas', () => {
    expect(emptyPreviewText('HERO', true)).toBeNull()
    expect(emptyPreviewText('HERO', false)).toBe('Sube una imagen para ver cómo se verá. Medidas recomendadas: 1200 × 520 px.')
    expect(emptyPreviewText('POPUP', false)).toContain('900 × 900 px')
    const banner = renderPreview({ ...detail(), draft: { ...detail().draft, imageDesktop: null } })
    expect(banner).toContain('Sube una imagen para ver cómo se verá')
  })
  it('el borrador se convierte a la forma pública que lee la tienda', () => {
    const d = detail({ fit: 'contain', focusX: 20, focusY: 80 })
    const hero = draftToCampaigns({ ...d.draft, imageMobile: 'data:image/png;base64,MMMM' })
    expect(hero.popup).toBeNull()
    expect(hero.hero).toEqual([{ id: 'preview', revision: 0, alt: 'Cámara', linkUrl: null, fit: 'contain', focusX: 20, focusY: 80, fitMobile: 'contain', focusMobileX: 20, focusMobileY: 80, imageDesktopUrl: 'data:image/png;base64,AAAA', imageMobileUrl: 'data:image/png;base64,MMMM' }])
    expect(draftToCampaigns({ ...d.draft, imageDesktop: null }).hero).toEqual([])
    const pop = draftToCampaigns(detail({}, 'POPUP').draft)
    expect(pop.hero).toEqual([])
    expect(pop.popup?.imageUrl).toBe('data:image/png;base64,BBBB')
    expect(draftToCampaigns({ ...detail({}, 'POPUP').draft, image: null }).popup).toBeNull()
  })
  it('el borrador lleva el encuadre móvil propio a la forma pública', () => {
    const d = detail({ fit: 'cover', focusX: 20, focusY: 80 })
    const hero = draftToCampaigns({ ...d.draft, imageMobile: 'data:image/png;base64,MMMM', fitMobile: 'contain', focusMobileX: 70, focusMobileY: 10 })
    expect(hero.hero[0]).toMatchObject({ fit: 'cover', focusX: 20, focusY: 80, fitMobile: 'contain', focusMobileX: 70, focusMobileY: 10 })
  })
  it('escala el lienzo para que quepa y nunca lo agranda', () => {
    expect(previewScale(640, PREVIEW_CANVAS_WIDTH.desktop)).toBe(0.5)
    expect(previewScale(2000, PREVIEW_CANVAS_WIDTH.desktop)).toBe(1)
    expect(previewScale(0, PREVIEW_CANVAS_WIDTH.mobile)).toBe(1)
  })
  it('compacto (pantalla angosta): empieza en Móvil, se puede ocultar y no muestra la nota de escritorio', () => {
    const out = renderToStaticMarkup(
      <CampaignPreview kind="HERO" alt="x" fit="cover" focusX={50} focusY={50} imageDesktop="data:image/png;base64,AAAA" imageMobile={null} image={null} />,
    )
    expect(out).toMatch(/aria-pressed="true"[^>]*>Móvil</)
    expect(out).toContain('Ocultar vista previa')
    expect(out).toContain('aria-expanded="true"')
    expect(out).toContain('width:390px')
    expect(out).toContain('min(420px, 55vh)')
    expect(out).not.toContain('portada real de la tienda, solo para mirar')
  })
  it('el panel deja espacio al final para el botón flotante', () => {
    expect(renderToStaticMarkup(<Drawer open onClose={() => undefined} title="x"><p>a</p></Drawer>)).toContain('pb-24')
  })
  it('lee la posición del banner solo de su iframe y con números válidos', () => {
    const frame = {}
    vi.stubGlobal('window', { location: { origin: 'http://tienda.test' } })
    try {
      const data = { type: 'gs-campaign-preview:layout', layout: { left: 10, width: 390, height: 165, headerHeight: 90 } }
      expect(readLayoutMessage({ data, origin: 'http://tienda.test', source: frame as never }, frame)).toEqual({ left: 10, width: 390, height: 165, headerHeight: 90 })
      expect(readLayoutMessage({ data, origin: 'http://tienda.test', source: {} as never }, frame)).toBeNull()
      expect(readLayoutMessage({ data: { ...data, layout: { left: 0, width: 0, height: 5 } }, origin: 'http://tienda.test', source: frame as never }, frame)).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('la tienda solo acepta el borrador de su ventana madre y del mismo origen', () => {
    const parent = {}
    vi.stubGlobal('window', { location: { origin: 'http://tienda.test' }, parent })
    try {
      const msg = { type: 'gs-campaign-preview:data', campaigns: { hero: [], popup: null } }
      expect(readPreviewMessage({ data: msg, origin: 'http://tienda.test', source: parent as never })).toEqual({ campaigns: { hero: [], popup: null }, align: 'top' })
      expect(readPreviewMessage({ data: { ...msg, align: 'banner' }, origin: 'http://tienda.test', source: parent as never })?.align).toBe('banner')
      expect(readPreviewMessage({ data: msg, origin: 'https://otro.example', source: parent as never })).toBeNull()
      expect(readPreviewMessage({ data: msg, origin: 'http://tienda.test', source: {} as never })).toBeNull()
      expect(readPreviewMessage({ data: { type: 'otro' }, origin: 'http://tienda.test', source: parent as never })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
