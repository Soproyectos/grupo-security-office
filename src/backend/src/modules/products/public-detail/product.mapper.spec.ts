import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PublicProductDetail } from '../public-catalog.service';
import { PublicProductDetailService } from './public-product-detail.service';
import { toProductDetailDto, type ProductRecord } from './product.mapper';

const base: PublicProductDetail = {
  id: 'p-1',
  sku: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  description: 'Cámara IP de 4 MP.',
  brand: { name: 'Hikvision', slug: 'hikvision' },
  category: { name: 'Domo', slug: 'camaras-ip-domo' },
  breadcrumb: [{ name: 'Videovigilancia', slug: 'videovigilancia' }],
  images: [
    { url: '/api/files/img-1', alt: null },
    { url: '/api/files/img-2', alt: 'Vista lateral' },
  ],
  technicalSpecs: [
    { key: 'Resolución', value: '4', unit: 'MP' },
    { key: 'Protocolo', value: 'ONVIF', unit: null },
  ],
  datasheets: [{ name: 'Ficha técnica', url: 'https://example.com/ds.pdf' }],
  price: { value: 118258.8, currency: 'COP' },
  isInformational: false,
};

const bare: ProductRecord = {
  catalogSlug: null,
  catalogBrand: null,
  catalogModel: null,
  catalogName: null,
  catalogStatus: null,
  catalogPublished: false,
  catalogBadges: [],
  catalogImageUrl: null,
  catalogImageAlt: null,
  catalogHighlights: [],
  catalogFeatures: null,
  catalogAvailableModels: [],
  catalogBreadcrumb: null,
  catalogSpecsDisclaimer: null,
  catalogFirmwareNote: null,
  catalogSpecGroups: [],
  catalogResources: [],
};

const enriched: ProductRecord = {
  ...bare,
  catalogSlug: 'ids-e04hqhi-d',
  catalogBrand: 'Hikvision Pro',
  catalogModel: 'iDS-E04HQHI-D',
  catalogName: 'DVR AcuSense de 4 canales',
  catalogStatus: 'DISCONTINUED',
  catalogPublished: true,
  catalogBadges: ['Destacado'],
  catalogImageUrl: '/images/productos/ids.webp',
  catalogImageAlt: 'DVR',
  catalogHighlights: ['H.265'],
  catalogFeatures: [{ id: 'f1', label: 'AcuSense', icon: 'shield' }],
  catalogAvailableModels: ['iDS-E04HQHI-D'],
  catalogBreadcrumb: [{ label: 'Productos', href: '/productos' }],
  catalogSpecGroups: [{ key: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
  catalogResources: [
    { id: 'r1', kind: 'DATASHEET', title: 'Datasheet', language: 'en', url: 'https://x/ds.pdf', fileName: null, version: null, region: null, requiresLicense: false },
    { id: 'r2', kind: 'FIRMWARE', title: 'FW', language: 'en', url: 'https://x/fw.bin', fileName: null, version: '1.0', region: null, requiresLicense: true },
  ],
};

describe('toProductDetailDto', () => {
  it('maps a bare product from its base data', () => {
    const dto = toProductDetailDto(bare, base);

    expect(dto).toMatchObject({
      id: 'p-1',
      slug: '',
      name: 'Cámara Domo 4K',
      brand: 'Hikvision',
      model: 'DS-2CD2143',
      status: 'active',
      price: { value: 118258.8, currency: 'COP' },
      image: { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
      highlights: [],
      features: [],
      availableModels: [],
      firmware: null,
    });
    expect(dto.images.map((i) => i.src)).toEqual(['/api/files/img-1', '/api/files/img-2']);
    expect(dto.breadcrumb).toEqual([
      { label: 'Catálogo', href: '/catalogo' },
      { label: 'Videovigilancia', href: '/catalogo/categoria/videovigilancia' },
      { label: 'Domo', href: '/catalogo/categoria/camaras-ip-domo' },
    ]);
  });

  it('carries base technical specs and datasheets into the sheet', () => {
    const dto = toProductDetailDto(bare, base);

    expect(dto.specGroups).toEqual([
      {
        id: 'especificaciones-tecnicas',
        title: 'Especificaciones técnicas',
        items: [
          { label: 'Resolución', value: '4 MP' },
          { label: 'Protocolo', value: 'ONVIF' },
        ],
      },
    ]);
    expect(dto.documents).toEqual([
      { id: 'datasheet-0', type: 'datasheet', title: 'Ficha técnica', language: 'es', url: 'https://example.com/ds.pdf' },
    ]);
  });

  it('returns empty sections for a bare product without base specs or datasheets', () => {
    const dto = toProductDetailDto(bare, { ...base, technicalSpecs: [], datasheets: [], images: [], category: null, breadcrumb: [], brand: null });

    expect(dto.specGroups).toEqual([]);
    expect(dto.documents).toEqual([]);
    expect(dto.image).toBeNull();
    expect(dto.images).toEqual([]);
    expect(dto.brand).toBe('');
    expect(dto.breadcrumb).toEqual([{ label: 'Catálogo', href: '/catalogo' }]);
  });

  it('prefers enriched data over base data', () => {
    const dto = toProductDetailDto(enriched, base);

    expect(dto).toMatchObject({
      slug: 'ids-e04hqhi-d',
      name: 'DVR AcuSense de 4 canales',
      brand: 'Hikvision Pro',
      model: 'iDS-E04HQHI-D',
      status: 'discontinued',
      price: { value: 118258.8, currency: 'COP' },
      image: { src: '/images/productos/ids.webp', alt: 'DVR' },
      breadcrumb: [{ label: 'Productos', href: '/productos' }],
      highlights: ['H.265'],
    });
    expect(dto.images.map((i) => i.src)).toEqual(['/images/productos/ids.webp', '/api/files/img-1', '/api/files/img-2']);
    expect(dto.specGroups).toEqual([{ id: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }]);
    expect(dto.documents.map((d) => d.id)).toEqual(['r1']);
    expect(dto.firmware?.files.map((f) => f.id)).toEqual(['r2']);
  });
});

describe('PublicProductDetailService.findByIdOrSlug', () => {
  const uuid = '37e5a4a6-935c-4760-89ed-83f938a9cd9b';

  const makeService = (opts: { slugHit?: boolean; enriched?: ProductRecord | null; getDetail?: jest.Mock } = {}) => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(opts.slugHit ? { id: uuid } : null),
        findUnique: jest.fn().mockResolvedValue(opts.enriched === undefined ? bare : opts.enriched),
      },
    };
    const catalog = { getDetail: opts.getDetail ?? jest.fn().mockResolvedValue(base) };
    return { service: new PublicProductDetailService(prisma as any, catalog as any), prisma, catalog };
  };

  it('resolves a product by id through the public catalog visibility rules', async () => {
    const { service, catalog, prisma } = makeService();

    const dto = await service.findByIdOrSlug(uuid);

    expect(dto.id).toBe('p-1');
    expect(catalog.getDetail).toHaveBeenCalledWith(uuid);
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('resolves a published slug to its product id', async () => {
    const { service, catalog } = makeService({ slugHit: true, enriched: enriched });

    const dto = await service.findByIdOrSlug('ids-e04hqhi-d');

    expect(dto.slug).toBe('ids-e04hqhi-d');
    expect(catalog.getDetail).toHaveBeenCalledWith(uuid);
  });

  it('answers 404 for an unknown or unpublished slug', async () => {
    const { service } = makeService({ slugHit: false });

    await expect(service.findByIdOrSlug('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 when the product is not visible to the public', async () => {
    const getDetail = jest.fn().mockRejectedValue(new NotFoundException('Producto no encontrado'));
    const { service } = makeService({ getDetail });

    await expect(service.findByIdOrSlug(uuid)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 400 for an identifier that is neither an id nor a slug', async () => {
    const { service } = makeService();

    await expect(service.findByIdOrSlug('not a slug!')).rejects.toBeInstanceOf(BadRequestException);
  });
});
