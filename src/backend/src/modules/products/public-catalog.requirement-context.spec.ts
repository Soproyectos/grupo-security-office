import { BadRequestException } from '@nestjs/common';
import { PublicCatalogService } from './public-catalog.service';
import type { RequirementProduct } from './public-requirements';

describe('PublicCatalogService requirement facet context', () => {
  const products: RequirementProduct[] = [
    { id: 'p1', categorySlug: 'alarmas', technicalSpecs: [{ key: 'protocol', value: ['HTTP', 'HTTPS'] }, { key: 'zone_count', value: 16 }] },
    { id: 'p2', categorySlug: 'alarmas', technicalSpecs: [{ key: 'protocol', value: 'HTTP' }, { key: 'zone_count', value: 16 }] },
    { id: 'p3', categorySlug: 'alarmas', technicalSpecs: [{ key: 'protocol', value: 'DHCP' }, { key: 'zone_count', value: 8 }] },
  ];

  it('scopes counts to search filters, alternatives, and selected protocol capabilities', async () => {
    const keySpecs = { matchingProductIds: jest.fn().mockResolvedValue(['p1', 'p2']) };
    const library = { client: { brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-id', isActive: true }) } } };
    const service = new PublicCatalogService({} as any, {} as any, library as any, keySpecs as any);
    jest.spyOn(service as any, 'requirementProducts').mockResolvedValue(products);
    const snapshotMatches = jest.spyOn(service as any, 'snapshotMatches').mockResolvedValue([{ id: 'p1' }]);

    const result = await service.requirements('alarmas', 'alarmas-cableadas', {
      q: 'panel', brand: 'marca', keySpec: ['modelo:K1'], requirement: ['protocol:HTTPS'],
    });

    expect(snapshotMatches).toHaveBeenCalledWith('panel', undefined, 'brand-id');
    expect(keySpecs.matchingProductIds).toHaveBeenCalledWith([{ specKey: 'modelo', value: 'K1' }]);
    const protocols = result.facets.find((facet) => facet.specKey === 'protocolo')!;
    expect(protocols.values.map(({ value, count }) => [value, count])).toEqual([
      ['HTTP', 1], ['HTTPS', 1], ['DHCP', 0],
    ]);
    const zones = result.facets.find((facet) => facet.specKey === 'zonas')!;
    expect(zones.values.map(({ value, count }) => [value, count])).toEqual([['8', 0], ['16', 1]]);
    expect(result.products).toBe(1);
  });

  it('requirements() devuelve truncated booleano con requisitos válidos', async () => {
    const service = new PublicCatalogService({} as any, {} as any, { client: {} } as any);
    jest.spyOn(service as any, 'requirementProducts').mockResolvedValue(products);

    const result = await service.requirements('alarmas', undefined, { requirement: ['protocolo:HTTP'] });

    expect(typeof result.truncated).toBe('boolean');
    expect(result.truncated).toBe(false);
  });

  it('requirements() rechaza una clave no permitida con BadRequestException y mensaje claro', async () => {
    const service = new PublicCatalogService({} as any, {} as any, { client: {} } as any);
    const load = jest.spyOn(service as any, 'requirementProducts');

    await expect(service.requirements('alarmas', undefined, { requirement: ['potencia_salida:500 W'] }))
      .rejects.toThrow(new BadRequestException('El requisito «potencia_salida» no está disponible para esta categoría'));
    expect(load).not.toHaveBeenCalled();
  });
});

describe('PublicCatalogService.search con requisitos', () => {
  const categoryTree = [
    { id: 'c-alarmas', name: 'Alarmas', slug: 'alarmas', parentId: null, isActive: true },
    { id: 'c-cctv', name: 'CCTV', slug: 'cctv', parentId: null, isActive: true },
  ];
  const rowFor = (id: string) => ({
    id, sku: `SKU-${id}`, name: `Panel ${id}`, lifecycleStatus: 'PUBLISHED', publicRevisionId: null,
    categoryId: 'c-alarmas', brandId: null, category: { name: 'Alarmas', slug: 'alarmas' }, brand: null, images: [],
  });
  const allowsId = (where: any, id: string): boolean => {
    if (Array.isArray(where)) return where.every((condition) => allowsId(condition, id));
    if (where?.AND) return allowsId(where.AND, id);
    if (where?.id?.in) return where.id.in.includes(id);
    return true;
  };
  const panel = (id: string, protocol: string | string[], zones: number): RequirementProduct => ({
    id, categorySlug: 'alarmas', technicalSpecs: [{ key: 'protocol', value: protocol }, { key: 'zone_count', value: zones }],
  });

  function build(products: RequirementProduct[]) {
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue(categoryTree) },
      product: {
        findMany: jest.fn(async ({ where }: any) => products.filter((p) => allowsId(where, p.id)).map((p) => rowFor(p.id))),
        count: jest.fn(async ({ where }: any) => products.filter((p) => allowsId(where, p.id)).length),
      },
    };
    const pricing = { getPublicPrices: jest.fn().mockResolvedValue(new Map()) };
    const service = new PublicCatalogService(prisma as any, pricing as any, { client: prisma } as any);
    jest.spyOn(service as any, 'requirementProducts').mockResolvedValue(products);
    jest.spyOn(service as any, 'snapshotMatches').mockResolvedValue(products.map((p) => ({ id: p.id, rank: 0, name: p.id })));
    return { service, prisma };
  }

  it('combina grupos distintos con AND y valores del mismo grupo con OR', async () => {
    const { service } = build([
      panel('p1', 'HTTP', 16),
      panel('p2', 'HTTPS', 8),
      panel('p3', 'HTTP', 8),
      panel('p4', 'DHCP', 16),
    ]);

    const result = await service.search({ category: 'alarmas', requirement: ['zonas:16', 'zonas:8', 'protocolo:HTTP'] });

    expect(result.data.map((row) => row.id)).toEqual(['p1', 'p3']);
  });

  it('un protocolo seleccionado varias veces exige todos los valores', async () => {
    const { service } = build([
      panel('p1', ['HTTP', 'HTTPS'], 8),
      panel('p2', 'HTTP', 8),
    ]);

    const result = await service.search({ category: 'alarmas', requirement: ['protocolo:HTTP', 'protocolo:HTTPS'] });

    expect(result.data.map((row) => row.id)).toEqual(['p1']);
  });

  it('una clave no permitida rechaza la búsqueda sin consultar productos', async () => {
    const { service, prisma } = build([panel('p1', 'HTTP', 8)]);

    await expect(service.search({ category: 'alarmas', requirement: ['potencia_salida:500 W'] }))
      .rejects.toThrow(new BadRequestException('El requisito «potencia_salida» no está disponible para esta categoría'));
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('una categoría sin familia de requisitos rechaza la búsqueda', async () => {
    const { service, prisma } = build([panel('p1', 'HTTP', 8)]);

    await expect(service.search({ category: 'cctv', requirement: ['zonas:8'] }))
      .rejects.toThrow(new BadRequestException('La categoría «cctv» no tiene requisitos técnicos'));
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('requisito sin categoría rechaza la búsqueda', async () => {
    const { service } = build([panel('p1', 'HTTP', 8)]);

    await expect(service.search({ requirement: ['zonas:8'] }))
      .rejects.toThrow(new BadRequestException('Selecciona una categoría para filtrar requisitos'));
  });
});
