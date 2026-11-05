import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';
import { AuditService } from '../audit/audit.service';
import { MarketingCampaignsController } from './marketing-campaigns.controller';
import { MarketingCampaignsPublicController, matchesEtag } from './marketing-campaigns-public.controller';
import { MarketingCampaignsService, AUDIT_ENTITY, AUDIT_EVENTS } from './marketing-campaigns.service';
import { MAX_IMAGE_BYTES, isCampaignContent, parseDataUrl } from './marketing-campaigns.rules';
import { jpegBytes, pngBytes, webpLosslessBytes } from './marketing-campaigns.test-helpers';

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const strip = (doc: any) => {
  if (!doc) return doc;
  const { imageDesktop: _d, imageMobile: _m, image: _i, ...rest } = doc;
  return rest;
};

/** In-memory stand-in of the Prisma calls the service makes; `$transaction` rolls the store back when the callback throws. */
function makeDb() {
  let store = new Map<string, any>();
  let audit: any[] = [];
  const state = { failAudit: false, queries: [] as string[] };

  const tx: any = {
    storefrontBanner: {
      create: async ({ data }: any) => {
        store.set(data.id, {
          id: data.id,
          draft: clone(data.draft),
          publishedData: null,
          revision: data.revision ?? 0,
          createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, store.size)).toISOString(),
          updatedAt: new Date().toISOString(),
        });
      },
      findUnique: async ({ where }: any) => clone(store.get(where.id)) ?? null,
      updateMany: async ({ where, data }: any) => {
        const row = store.get(where.id);
        if (!row || row.revision !== where.revision) return { count: 0 };
        if ('draft' in data) row.draft = clone(data.draft);
        if ('publishedData' in data) row.publishedData = data.publishedData === Prisma.DbNull ? null : clone(data.publishedData);
        row.revision += data.revision.increment;
        return { count: 1 };
      },
      deleteMany: async ({ where }: any) => {
        const row = store.get(where.id);
        if (!row || row.revision !== where.revision) return { count: 0 };
        store.delete(where.id);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (state.failAudit) throw new Error('audit unavailable');
        audit.push(clone(data));
        return data;
      },
    },
    $executeRaw: async () => 1,
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join('?');
      state.queries.push(sql);
      const rows = [...store.values()];
      const hasKind = (doc: any) => doc && ['HERO', 'POPUP'].includes(doc.kind);
      if (sql.includes('"samePublished"')) {
        return rows
          .filter((r) => hasKind(r.draft))
          .map((r) => ({
            id: r.id, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt,
            draft: strip(r.draft), published: r.publishedData ? strip(r.publishedData) : null,
            hasImageDesktop: r.draft.imageDesktop != null, hasImageMobile: r.draft.imageMobile != null, hasImage: r.draft.image != null,
            samePublished: !!r.publishedData && JSON.stringify(r.publishedData) === JSON.stringify(r.draft),
          }));
      }
      if (sql.includes('"content"') && sql.includes('"hasImageDesktop"')) {
        return rows
          .filter((r) => r.publishedData && hasKind(r.publishedData))
          .map((r) => ({
            id: r.id, revision: r.revision, createdAt: r.createdAt, content: strip(r.publishedData),
            hasImageDesktop: r.publishedData.imageDesktop != null, hasImageMobile: r.publishedData.imageMobile != null, hasImage: r.publishedData.image != null,
          }));
      }
      if (sql.includes('"dataUrl"')) {
        const [field, id] = values;
        const r = store.get(id);
        return r && r.publishedData ? [{ revision: r.revision, content: strip(r.publishedData), dataUrl: r.publishedData[field] ?? null }] : [];
      }
      if (sql.includes('<>')) {
        const [kind, id] = values;
        return rows.filter((r) => r.publishedData?.kind === kind && r.id !== id).map((r) => ({ id: r.id, endsAt: r.publishedData.endsAt ?? null }));
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const prisma: any = {
    ...tx,
    $transaction: async (fn: (client: any) => Promise<unknown>) => {
      const snapshotStore = new Map([...store].map(([k, v]) => [k, clone(v)]));
      const snapshotAudit = audit.length;
      try {
        return await fn(tx);
      } catch (error) {
        store = snapshotStore;
        audit = audit.slice(0, snapshotAudit);
        throw error;
      }
    },
  };
  return { prisma, state, get audit() { return audit; }, get store() { return store; } };
}

const ADMIN = { userId: 'admin-1', roles: ['Super Admin'] };
const NOW = new Date('2026-11-10T12:00:00.000Z');
const grantRows = (...ids: string[]) => ids.map((actionId, i) => ({ sourceId: `g${i}`, actionId, scope: 'global' }));

describe('MarketingCampaignsService', () => {
  let db: ReturnType<typeof makeDb>;
  let service: MarketingCampaignsService;
  const makeService = (grants?: any) =>
    new MarketingCampaignsService(db.prisma, new AuditService(db.prisma, {} as never), grants);

  beforeEach(() => {
    db = makeDb();
    service = makeService();
  });

  const createHero = async (overrides: Record<string, unknown> = {}) =>
    service.create({ kind: 'HERO', name: 'Campaña de prueba', alt: 'Cámaras en oferta', ...overrides } as any, ADMIN);
  const createPopup = async (overrides: Record<string, unknown> = {}) =>
    service.create({ kind: 'POPUP', name: 'Pop-up de prueba', alt: 'Promoción del mes', ...overrides } as any, ADMIN);
  const png = (w: number, h: number) => ({ buffer: pngBytes(w, h) });
  /** Hero with desktop image, ready to publish. */
  const readyHero = async (overrides: Record<string, unknown> = {}) => {
    const created = await createHero(overrides);
    await service.setImage(created.id, 'desktop', png(1200, 520), ADMIN);
    return created.id;
  };
  const readyPopup = async (overrides: Record<string, unknown> = {}) => {
    const created = await createPopup(overrides);
    await service.setImage(created.id, 'image', png(800, 800), ADMIN);
    return created.id;
  };

  describe('permisos declarados en los controladores', () => {
    const proto = MarketingCampaignsController.prototype as any;
    const grantsOf = (handler: string) => Reflect.getMetadata(REQUIRED_GRANTS_KEY, proto[handler]);

    it('cada ruta de administración exige su permiso del panel', () => {
      expect(grantsOf('list')).toEqual(['marketing:read']);
      expect(grantsOf('get')).toEqual(['marketing:read']);
      expect(grantsOf('create')).toEqual(['marketing:create']);
      expect(grantsOf('update')).toEqual(['marketing:edit']);
      expect(grantsOf('uploadImage')).toEqual(['marketing:read']);
      expect(grantsOf('removeImage')).toEqual(['marketing:read']);
      expect(grantsOf('publish')).toEqual(['marketing:publish']);
      expect(grantsOf('unpublish')).toEqual(['marketing:publish']);
      expect(grantsOf('remove')).toEqual(['marketing:delete']);
    });

    it('ninguna ruta de administración queda sin permiso y el controlador público es @Public', () => {
      const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && n !== 'ctx');
      for (const name of names) expect(grantsOf(name)).toBeDefined();
      expect(Reflect.getMetadata('isPublic', MarketingCampaignsPublicController)).toBe(true);
    });
  });

  describe('crear y editar el borrador', () => {
    it('crea el borrador con valores por defecto y lo audita sin imágenes', async () => {
      const campaign = await createHero({ linkUrl: ' /catalogo ' });
      expect(campaign).toMatchObject({ kind: 'HERO', revision: 0, status: 'DRAFT', hasPublished: false, hasUnpublishedChanges: false, linkUrl: '/catalogo', fit: 'cover', focusX: 50, focusY: 50, fitMobile: 'cover', focusMobileX: 50, focusMobileY: 50, position: 0 });
      expect(campaign.draft.imageDesktop).toBeNull();
      expect(db.audit).toHaveLength(1);
      expect(db.audit[0]).toMatchObject({ userId: 'admin-1', action: AUDIT_EVENTS.create, entity: AUDIT_ENTITY, entityId: campaign.id });
      expect(JSON.stringify(db.audit)).not.toContain('base64');
    });

    it('rechaza enlaces maliciosos y fechas incoherentes sin guardar nada', async () => {
      await expect(createHero({ linkUrl: 'javascript:alert(1)' })).rejects.toThrow(BadRequestException);
      await expect(createHero({ linkUrl: '//evil.com' })).rejects.toThrow(BadRequestException);
      await expect(createHero({ startsAt: '2026-11-12T00:00:00Z', endsAt: '2026-11-11T00:00:00Z' })).rejects.toThrow(BadRequestException);
      expect(db.store.size).toBe(0);
      expect(db.audit).toHaveLength(0);
    });

    it('edita, sube la revisión y audita el antes y el después', async () => {
      const { id } = await createHero();
      const updated = await service.update(id, { revision: 0, name: 'Nuevo nombre', linkUrl: 'https://www.gruposecurity.co/promo', focusX: 20 } as any, ADMIN);
      expect(updated).toMatchObject({ revision: 1, name: 'Nuevo nombre', linkUrl: 'https://www.gruposecurity.co/promo', focusX: 20 });
      expect(db.audit[1]).toMatchObject({
        action: AUDIT_EVENTS.edit,
        entity: AUDIT_ENTITY,
        oldValues: { name: 'Campaña de prueba', linkUrl: null, focusX: 50 },
        newValues: { name: 'Nuevo nombre', linkUrl: 'https://www.gruposecurity.co/promo', focusX: 20 },
      });
    });

    it('sin campos móviles (campaña antigua) el móvil hereda el encuadre de escritorio', async () => {
      const { id } = await createHero({ fit: 'contain', focusX: 20, focusY: 80 });
      expect(db.store.get(id).draft).not.toHaveProperty('fitMobile');
      expect(await service.get(id)).toMatchObject({ fitMobile: 'contain', focusMobileX: 20, focusMobileY: 80 });
      const legacy = await createHero();
      delete db.store.get(legacy.id).draft.focusX;
      expect(await service.get(legacy.id)).toMatchObject({ focusX: 50, focusMobileX: 50, fitMobile: 'cover' });
    });

    it('guarda un encuadre móvil independiente y audita el cambio', async () => {
      const { id } = await createHero({ focusX: 20 });
      const updated = await service.update(id, { revision: 0, fitMobile: 'contain', focusMobileX: 70, focusMobileY: 10 } as any, ADMIN);
      expect(updated).toMatchObject({ fit: 'cover', focusX: 20, fitMobile: 'contain', focusMobileX: 70, focusMobileY: 10 });
      expect(db.audit[1]).toMatchObject({ action: AUDIT_EVENTS.edit, newValues: { fitMobile: 'contain', focusMobileX: 70, focusMobileY: 10 } });
      const same = await service.update(id, { revision: updated.revision, fitMobile: 'contain', focusMobileX: 70 } as any, ADMIN);
      expect(same.revision).toBe(updated.revision);
      const inheriting = await createHero({ focusX: 20 });
      const untouched = await service.update(inheriting.id, { revision: 0, fit: 'cover', focusMobileX: 20, fitMobile: 'cover' } as any, ADMIN);
      expect(untouched.revision).toBe(0);
      const created = await createHero({ fitMobile: 'contain', focusMobileY: 5 });
      expect(created).toMatchObject({ fitMobile: 'contain', focusMobileX: 50, focusMobileY: 5 });
    });

    it('null borra el enlace y las fechas', async () => {
      const { id } = await createHero({ linkUrl: '/x', startsAt: '2026-11-01T00:00:00Z' });
      const updated = await service.update(id, { revision: 0, linkUrl: null, startsAt: null } as any, ADMIN);
      expect(updated).toMatchObject({ linkUrl: null, startsAt: null });
    });

    it('409 si la revisión está desactualizada y no cambia nada', async () => {
      const { id } = await createHero();
      await service.update(id, { revision: 0, name: 'Primera edición' } as any, ADMIN);
      await expect(service.update(id, { revision: 0, name: 'Edición vieja' } as any, ADMIN)).rejects.toThrow(ConflictException);
      expect((await service.get(id)).name).toBe('Primera edición');
      expect(db.audit).toHaveLength(2);
    });

    it('sin cambios reales no sube la revisión ni audita', async () => {
      const { id } = await createHero();
      const result = await service.update(id, { revision: 0, name: 'Campaña de prueba' } as any, ADMIN);
      expect(result.revision).toBe(0);
      expect(db.audit).toHaveLength(1);
    });

    it('valida enlace y fechas al editar', async () => {
      const { id } = await createHero({ startsAt: '2026-11-12T00:00:00Z' });
      await expect(service.update(id, { revision: 0, linkUrl: 'data:text/html,x' } as any, ADMIN)).rejects.toThrow(BadRequestException);
      await expect(service.update(id, { revision: 0, endsAt: '2026-11-11T00:00:00Z' } as any, ADMIN)).rejects.toThrow(BadRequestException);
    });

    it('404 para una campaña inexistente o una fila heredada sin tipo', async () => {
      await expect(service.get('00000000-0000-4000-8000-000000000000')).rejects.toThrow(NotFoundException);
      db.store.set('legacy', { id: 'legacy', draft: { title: 'Hikvision y HiLook', imageDesktop: '/images/home/banner-hikvision.jpg' }, publishedData: { title: 'x' }, revision: 0, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' });
      await expect(service.get('legacy')).rejects.toThrow(NotFoundException);
      await expect(service.update('legacy', { revision: 0, name: 'x' } as any, ADMIN)).rejects.toThrow(NotFoundException);
      await expect(service.publish('legacy', undefined, ADMIN, NOW)).rejects.toThrow(NotFoundException);
      await expect(service.remove('legacy', ADMIN)).rejects.toThrow(NotFoundException);
      expect(await service.list(NOW)).toEqual([]);
      expect(await service.listPublic(NOW)).toEqual({ hero: [], popup: null });
    });
  });

  describe('imágenes', () => {
    it('guarda un PNG de escritorio como data URL y audita medidas (sin bytes)', async () => {
      const { id } = await createHero();
      const result = await service.setImage(id, 'desktop', png(1200, 520), ADMIN);
      expect(result).toMatchObject({ hasImageDesktop: true, hasImageMobile: false, revision: 1 });
      expect(parseDataUrl(result.draft.imageDesktop)).toMatchObject({ mime: 'image/png' });
      expect(db.audit[1]).toMatchObject({ action: AUDIT_EVENTS.imageUpload, entity: AUDIT_ENTITY, newValues: { slot: 'desktop', mime: 'image/png', width: 1200, height: 520 } });
      expect(JSON.stringify(db.audit)).not.toContain('base64');
    });

    it('acepta JPEG para el móvil y WebP para el pop-up', async () => {
      const hero = await createHero();
      await service.setImage(hero.id, 'mobile', { buffer: jpegBytes(900, 675) }, ADMIN);
      expect((await service.get(hero.id)).hasImageMobile).toBe(true);
      const popup = await createPopup();
      await service.setImage(popup.id, 'image', { buffer: webpLosslessBytes(800, 800) }, ADMIN);
      expect(parseDataUrl((await service.get(popup.id)).draft.image)).toMatchObject({ mime: 'image/webp' });
    });

    it('rechaza una firma falsa aunque el nombre o el tipo declarado digan PNG', async () => {
      const { id } = await createHero();
      const fake = { buffer: Buffer.from('<html><script>alert(1)</script></html>'), mimetype: 'image/png', originalname: 'banner.png' } as any;
      await expect(service.setImage(id, 'desktop', fake, ADMIN)).rejects.toThrow(/PNG, JPEG o WebP/);
      expect((await service.get(id)).hasImageDesktop).toBe(false);
      expect(db.audit).toHaveLength(1);
    });

    it('rechaza más de 3 MB', async () => {
      const { id } = await createHero();
      const big = { buffer: Buffer.concat([pngBytes(1200, 520), Buffer.alloc(MAX_IMAGE_BYTES)]) };
      await expect(service.setImage(id, 'desktop', big, ADMIN)).rejects.toThrow(/3 MB/);
    });

    it('rechaza medidas fuera de rango nombrando lo que mide y lo esperado', async () => {
      const hero = await createHero();
      await expect(service.setImage(hero.id, 'desktop', png(800, 800), ADMIN)).rejects.toThrow(
        'La imagen mide 800 × 800 px; el ancho mínimo es 1000 px, para el banner de escritorio sube una de 1200 × 520 px aproximadamente',
      );
      await expect(service.setImage(hero.id, 'desktop', png(1200, 1200), ADMIN)).rejects.toThrow(/proporción/);
      await expect(service.setImage(hero.id, 'mobile', png(900, 900), ADMIN)).rejects.toThrow(/900 × 675 px/);
      const popup = await createPopup();
      await expect(service.setImage(popup.id, 'image', png(500, 500), ADMIN)).rejects.toThrow(/ancho mínimo es 600 px/);
      expect(db.audit).toHaveLength(2); // solo las dos creaciones
    });

    it('cada tipo solo admite sus espacios', async () => {
      const hero = await createHero();
      const popup = await createPopup();
      await expect(service.setImage(hero.id, 'image', png(800, 800), ADMIN)).rejects.toThrow(BadRequestException);
      await expect(service.setImage(popup.id, 'desktop', png(1200, 520), ADMIN)).rejects.toThrow(BadRequestException);
      await expect(service.setImage(hero.id, 'banner', png(1200, 520), ADMIN)).rejects.toThrow(BadRequestException);
      await expect(service.setImage(hero.id, 'desktop', undefined, ADMIN)).rejects.toThrow(BadRequestException);
    });

    it('exige crear o editar además de ver', async () => {
      const { id } = await createHero();
      const user = { userId: 'user-1', roles: ['Vendedor'] };
      const only = (...ids: string[]) => makeService({ grantsForUser: async () => grantRows(...ids) });
      await expect(only('marketing:read').setImage(id, 'desktop', png(1200, 520), user)).rejects.toThrow(ForbiddenException);
      await expect(only('marketing:read', 'marketing:publish').removeImage(id, 'desktop', user)).rejects.toThrow(ForbiddenException);
      await expect(makeService().setImage(id, 'desktop', png(1200, 520), user)).rejects.toThrow(ForbiddenException);
      await expect(only('marketing:read', 'marketing:edit').setImage(id, 'desktop', png(1200, 520), user)).resolves.toBeDefined();
      await expect(only('marketing:read', 'marketing:create').setImage(id, 'mobile', png(900, 675), user)).resolves.toBeDefined();
    });

    it('quita una imagen del borrador y lo audita', async () => {
      const id = await readyHero();
      const result = await service.removeImage(id, 'desktop', ADMIN);
      expect(result.hasImageDesktop).toBe(false);
      expect(db.audit.at(-1)).toMatchObject({ action: AUDIT_EVENTS.imageRemove, newValues: { slot: 'desktop', removed: true } });
    });
  });

  describe('publicar y retirar', () => {
    it('exige la imagen requerida y el texto alternativo', async () => {
      const noImage = await createHero();
      await expect(service.publish(noImage.id, undefined, ADMIN, NOW)).rejects.toThrow(/imagen de escritorio/);
      const noAlt = await createHero({ alt: undefined });
      await service.setImage(noAlt.id, 'desktop', png(1200, 520), ADMIN);
      await expect(service.publish(noAlt.id, undefined, ADMIN, NOW)).rejects.toThrow(/texto alternativo/);
      const popup = await createPopup();
      await expect(service.publish(popup.id, undefined, ADMIN, NOW)).rejects.toThrow(/imagen del pop-up/);
      expect((await service.get(noImage.id)).status).toBe('DRAFT');
    });

    it('copia el borrador a lo publicado, sube la revisión y audita', async () => {
      const id = await readyHero();
      const result = await service.publish(id, { revision: 1 }, ADMIN, NOW);
      expect(result).toMatchObject({ status: 'PUBLISHED', hasPublished: true, hasUnpublishedChanges: false, validity: 'ACTIVE', isLive: true, revision: 2 });
      expect(db.store.get(id).publishedData).toEqual(db.store.get(id).draft);
      expect(db.audit.at(-1)).toMatchObject({ action: AUDIT_EVENTS.publish, entity: AUDIT_ENTITY, entityId: id, oldValues: { published: false } });
    });

    it('409 si la revisión indicada ya no es la del borrador', async () => {
      const id = await readyHero();
      await expect(service.publish(id, { revision: 0 }, ADMIN, NOW)).rejects.toThrow(ConflictException);
      expect((await service.get(id)).hasPublished).toBe(false);
    });

    it('rechaza publicar una vigencia ya vencida', async () => {
      const id = await readyHero({ endsAt: '2026-11-01T00:00:00Z' });
      await expect(service.publish(id, undefined, ADMIN, NOW)).rejects.toThrow(/vigencia ya venció/);
    });

    it('hasUnpublishedChanges aparece al editar después de publicar y desaparece al republicar', async () => {
      const id = await readyHero();
      await service.publish(id, undefined, ADMIN, NOW);
      const edited = await service.update(id, { revision: 2, alt: 'Texto nuevo' } as any, ADMIN);
      expect(edited).toMatchObject({ hasPublished: true, hasUnpublishedChanges: true });
      const again = await service.publish(id, undefined, ADMIN, NOW);
      expect(again).toMatchObject({ hasUnpublishedChanges: false });
      expect(db.audit.at(-1)).toMatchObject({ oldValues: { published: true } });
    });

    it('máximo 6 banners del título publicados a la vez; los vencidos no ocupan lugar', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = await readyHero({ name: `Banner ${i}`, position: i });
        await service.publish(id, undefined, ADMIN, NOW);
        ids.push(id);
      }
      const seventh = await readyHero({ name: 'Banner 7' });
      await expect(service.publish(seventh, undefined, ADMIN, NOW)).rejects.toThrow(/Ya hay 6 banners/);
      await expect(service.publish(seventh, undefined, ADMIN, NOW)).rejects.toBeInstanceOf(ConflictException);
      // Republicar uno que ya está publicado no cuenta contra sí mismo.
      await expect(service.publish(ids[0], undefined, ADMIN, NOW)).resolves.toBeDefined();
      // Retirar uno libera el lugar.
      await service.unpublish(ids[5], ADMIN);
      await expect(service.publish(seventh, undefined, ADMIN, NOW)).resolves.toBeDefined();
      // Un publicado cuya vigencia ya terminó deja de ocupar lugar.
      db.store.get(ids[1]).publishedData.endsAt = '2026-11-05T00:00:00.000Z';
      const eighth = await readyHero({ name: 'Banner 8' });
      await expect(service.publish(eighth, undefined, ADMIN, NOW)).resolves.toBeDefined();
    });

    it('solo un pop-up publicado a la vez, y los límites son independientes por tipo', async () => {
      const first = await readyPopup();
      const second = await readyPopup({ name: 'Otro pop-up' });
      await service.publish(first, undefined, ADMIN, NOW);
      await expect(service.publish(second, undefined, ADMIN, NOW)).rejects.toThrow(/Ya hay un pop-up publicado/);
      await expect(service.publish(await readyHero(), undefined, ADMIN, NOW)).resolves.toBeDefined();
      await service.unpublish(first, ADMIN);
      await expect(service.publish(second, undefined, ADMIN, NOW)).resolves.toBeDefined();
    });

    it('retira conservando el borrador; retirar dos veces es 409', async () => {
      const id = await readyHero();
      await service.publish(id, undefined, ADMIN, NOW);
      const result = await service.unpublish(id, ADMIN);
      expect(result).toMatchObject({ status: 'DRAFT', hasPublished: false, hasImageDesktop: true });
      expect(db.audit.at(-1)).toMatchObject({ action: AUDIT_EVENTS.unpublish, entity: AUDIT_ENTITY });
      await expect(service.unpublish(id, ADMIN)).rejects.toThrow(ConflictException);
    });

    it('eliminar: 409 mientras esté publicada; borrador sí y queda auditado', async () => {
      const id = await readyHero();
      await service.publish(id, undefined, ADMIN, NOW);
      await expect(service.remove(id, ADMIN)).rejects.toThrow(/retírala antes/);
      expect(db.store.has(id)).toBe(true);
      await service.unpublish(id, ADMIN);
      await expect(service.remove(id, ADMIN)).resolves.toEqual({ id, deleted: true });
      expect(db.store.has(id)).toBe(false);
      expect(db.audit.at(-1)).toMatchObject({ action: AUDIT_EVENTS.delete, entity: AUDIT_ENTITY, entityId: id });
      expect(JSON.stringify(db.audit)).not.toContain('base64');
    });
  });

  describe('auditoría en la misma transacción', () => {
    it.each([
      ['crear', async () => createHero()],
      ['editar', async () => { const { id } = await createHero(); db.state.failAudit = true; return service.update(id, { revision: 0, name: 'Cambio' } as any, ADMIN); }],
      ['subir imagen', async () => { const { id } = await createHero(); db.state.failAudit = true; return service.setImage(id, 'desktop', png(1200, 520), ADMIN); }],
      ['publicar', async () => { const id = await readyHero(); db.state.failAudit = true; return service.publish(id, undefined, ADMIN, NOW); }],
      ['retirar', async () => { const id = await readyHero(); await service.publish(id, undefined, ADMIN, NOW); db.state.failAudit = true; return service.unpublish(id, ADMIN); }],
      ['eliminar', async () => { const { id } = await createHero(); db.state.failAudit = true; return service.remove(id, ADMIN); }],
    ])('si falla la auditoría al %s, el cambio no persiste', async (name, run) => {
      if (name === 'crear') db.state.failAudit = true;
      // Los pasos previos de cada caso se hacen con auditoría activa: la foto se toma justo al abrir la transacción que debe fallar.
      let snapshot = '';
      let auditCount = -1;
      const original = db.prisma.$transaction;
      db.prisma.$transaction = async (fn: any) => {
        if (db.state.failAudit) { snapshot = JSON.stringify([...db.store]); auditCount = db.audit.length; }
        return original(fn);
      };
      await expect(run()).rejects.toThrow('audit unavailable');
      expect(JSON.stringify([...db.store])).toBe(snapshot);
      expect(db.audit.length).toBe(auditCount);
    });
  });

  describe('lista de administración', () => {
    it('devuelve metadatos y banderas, nunca los base64', async () => {
      const heroId = await readyHero({ position: 2 });
      const popupId = await readyPopup();
      await service.publish(heroId, undefined, ADMIN, NOW);
      const draftOnly = await createHero({ position: 1, name: 'Solo borrador' });
      const list = await service.list(NOW);
      expect(JSON.stringify(list)).not.toContain('base64');
      expect(list.map((c) => c.id)).toEqual([draftOnly.id, heroId, popupId]); // HERO por posición, luego POPUP
      expect(list.find((c) => c.id === heroId)).toMatchObject({ hasImageDesktop: true, hasPublished: true, hasUnpublishedChanges: false, status: 'PUBLISHED', validity: 'ACTIVE' });
      expect(list.find((c) => c.id === draftOnly.id)).toMatchObject({ hasImageDesktop: false, hasPublished: false, validity: null, status: 'DRAFT' });
      expect(list.find((c) => c.id === popupId)).toMatchObject({ kind: 'POPUP', hasImage: true });
    });

    it('marca una publicada con ventana futura o terminada', async () => {
      const scheduled = await readyHero({ startsAt: '2026-12-01T00:00:00Z' });
      await service.publish(scheduled, undefined, ADMIN, NOW);
      const list = await service.list(NOW);
      expect(list[0]).toMatchObject({ validity: 'SCHEDULED', isLive: false });
      expect((await service.list(new Date('2027-01-01T00:00:00Z')))[0]).toMatchObject({ validity: 'ACTIVE' });
    });
  });

  describe('endpoint público', () => {
    it('devuelve solo lo publicado y vigente, ordenado por posición, con URLs de imagen', async () => {
      const second = await readyHero({ position: 2, name: 'Segundo', linkUrl: '/catalogo' });
      const first = await readyHero({ position: 1, name: 'Primero', fit: 'contain', focusX: 10, focusY: 90 });
      await service.setImage(first, 'mobile', png(900, 675), ADMIN);
      const draftOnly = await readyHero({ position: 0, name: 'Solo borrador' });
      const scheduled = await readyHero({ position: 3, startsAt: '2026-12-01T00:00:00Z' });
      const expired = await readyHero({ position: 4, endsAt: '2026-11-09T00:00:00Z' });
      for (const id of [second, first, scheduled]) await service.publish(id, undefined, ADMIN, NOW);
      // La vencida se publicó cuando aún estaba vigente: ahora ya terminó.
      await service.publish(expired, undefined, ADMIN, new Date('2026-11-08T00:00:00Z'));
      const popup = await readyPopup({ linkUrl: 'https://www.gruposecurity.co/promo' });
      await service.publish(popup, undefined, ADMIN, NOW);

      const result = await service.listPublic(NOW);
      expect(result.hero.map((h) => h.id)).toEqual([first, second]);
      expect(result.hero[0]).toEqual({
        id: first, revision: expect.any(Number), alt: 'Cámaras en oferta', linkUrl: null, fit: 'contain', focusX: 10, focusY: 90,
        fitMobile: 'contain', focusMobileX: 10, focusMobileY: 90,
        imageDesktopUrl: expect.stringMatching(new RegExp(`^/api/storefront/campaigns/${first}/image/desktop\\?v=\\d+$`)),
        imageMobileUrl: expect.stringMatching(new RegExp(`^/api/storefront/campaigns/${first}/image/mobile\\?v=\\d+$`)),
      });
      expect(result.hero[1].imageMobileUrl).toBeNull();
      expect(result.hero.map((h) => h.id)).not.toContain(draftOnly);
      expect(result.popup).toEqual({ id: popup, revision: expect.any(Number), alt: 'Promoción del mes', linkUrl: 'https://www.gruposecurity.co/promo', imageUrl: expect.stringContaining(`/${popup}/image/image?v=`) });
      expect(Object.keys(result.popup!).sort()).toEqual(['alt', 'id', 'imageUrl', 'linkUrl', 'revision']); // sin título ni descripción
      expect(JSON.stringify(result)).not.toContain('base64');
      expect(JSON.stringify(result)).not.toContain('Solo borrador');
    });

    it('publicar copia el encuadre móvil y el público lo devuelve (con herencia si falta)', async () => {
      const withMobile = await readyHero({ position: 1, fit: 'contain', focusX: 10, focusY: 90, fitMobile: 'cover', focusMobileX: 65, focusMobileY: 30 });
      const inherits = await readyHero({ position: 2, focusX: 33 });
      await service.publish(withMobile, undefined, ADMIN, NOW);
      await service.publish(inherits, undefined, ADMIN, NOW);
      expect(db.store.get(withMobile).publishedData).toMatchObject({ fitMobile: 'cover', focusMobileX: 65, focusMobileY: 30 });
      const { hero } = await service.listPublic(NOW);
      expect(hero[0]).toMatchObject({ fit: 'contain', focusX: 10, focusY: 90, fitMobile: 'cover', focusMobileX: 65, focusMobileY: 30 });
      expect(hero[1]).toMatchObject({ fit: 'cover', focusX: 33, fitMobile: 'cover', focusMobileX: 33, focusMobileY: 50 });
    });

    it('sin campañas publicadas: hero vacío y popup null', async () => {
      await readyHero();
      expect(await service.listPublic(NOW)).toEqual({ hero: [], popup: null });
    });

    it('nunca consulta la columna del borrador', async () => {
      await service.listPublic(NOW);
      await service.publicImage('x', 'desktop', NOW).catch(() => undefined);
      for (const sql of db.state.queries) expect(sql).not.toContain('"draft"');
    });

    it('sirve la imagen de la copia publicada con su ETag (id + revisión + espacio)', async () => {
      const id = await readyHero();
      await service.publish(id, undefined, ADMIN, NOW);
      const image = await service.publicImage(id, 'desktop', NOW);
      expect(image.mime).toBe('image/png');
      expect(image.buffer.equals(pngBytes(1200, 520))).toBe(true);
      expect(image.etag).toBe(`"${id}-2-desktop"`);
    });

    it('un borrador editado después de publicar NO cambia lo que se sirve', async () => {
      const id = await readyHero();
      await service.publish(id, undefined, ADMIN, NOW);
      await service.setImage(id, 'desktop', { buffer: jpegBytes(1300, 520) }, ADMIN); // nueva imagen solo en el borrador
      const image = await service.publicImage(id, 'desktop', NOW);
      expect(image.mime).toBe('image/png');
      expect(image.buffer.equals(pngBytes(1200, 520))).toBe(true);
      // Al republicar sí cambia, y el ETag también.
      const before = image.etag;
      await service.publish(id, undefined, ADMIN, NOW);
      const after = await service.publicImage(id, 'desktop', NOW);
      expect(after.mime).toBe('image/jpeg');
      expect(after.etag).not.toBe(before);
    });

    it('404 para borradores, retiradas, vencidas, programadas, espacios ausentes o inválidos', async () => {
      const draft = await readyHero();
      await expect(service.publicImage(draft, 'desktop', NOW)).rejects.toThrow(NotFoundException);

      const withdrawn = await readyHero();
      await service.publish(withdrawn, undefined, ADMIN, NOW);
      await service.unpublish(withdrawn, ADMIN);
      await expect(service.publicImage(withdrawn, 'desktop', NOW)).rejects.toThrow(NotFoundException);

      const expired = await readyHero({ endsAt: '2026-11-09T00:00:00Z' });
      await service.publish(expired, undefined, ADMIN, new Date('2026-11-08T00:00:00Z'));
      await expect(service.publicImage(expired, 'desktop', NOW)).rejects.toThrow(NotFoundException);

      const scheduled = await readyHero({ startsAt: '2026-12-01T00:00:00Z' });
      await service.publish(scheduled, undefined, ADMIN, NOW);
      await expect(service.publicImage(scheduled, 'desktop', NOW)).rejects.toThrow(NotFoundException);

      const live = await readyHero();
      await service.publish(live, undefined, ADMIN, NOW);
      await expect(service.publicImage(live, 'mobile', NOW)).rejects.toThrow(NotFoundException); // sin imagen móvil
      await expect(service.publicImage(live, 'image', NOW)).rejects.toThrow(NotFoundException); // espacio de otro tipo
      await expect(service.publicImage(live, '../../etc/passwd', NOW)).rejects.toThrow(NotFoundException);
      await expect(service.publicImage('00000000-0000-4000-8000-000000000000', 'desktop', NOW)).rejects.toThrow(NotFoundException);
    });

    it('una fila publicada heredada (sin tipo) nunca se expone', async () => {
      db.store.set('legacy', { id: 'legacy', draft: { title: 'EZVIZ', imageDesktop: '/images/home/banner-ezviz.jpg' }, publishedData: { title: 'EZVIZ', imageDesktop: '/images/home/banner-ezviz.jpg' }, revision: 0, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' });
      expect(await service.listPublic(NOW)).toEqual({ hero: [], popup: null });
      await expect(service.publicImage('legacy', 'desktop', NOW)).rejects.toThrow(NotFoundException);
    });
  });
});

describe('matchesEtag', () => {
  it('compara contra la lista de If-None-Match ignorando el prefijo débil', () => {
    expect(matchesEtag('"a-1-desktop"', '"a-1-desktop"')).toBe(true);
    expect(matchesEtag('"x", W/"a-1-desktop"', '"a-1-desktop"')).toBe(true);
    expect(matchesEtag('"a-2-desktop"', '"a-1-desktop"')).toBe(false);
    expect(matchesEtag(undefined, '"a-1-desktop"')).toBe(false);
  });
});

describe('contenido', () => {
  it('isCampaignContent solo reconoce HERO y POPUP', () => {
    expect(isCampaignContent({ kind: 'HERO' })).toBe(true);
    expect(isCampaignContent({ kind: 'POPUP' })).toBe(true);
    expect(isCampaignContent({ title: 'x' })).toBe(false);
    expect(isCampaignContent(null)).toBe(false);
    expect(isCampaignContent([])).toBe(false);
  });
});
