import { BadRequestException } from '@nestjs/common';
import { PublicCatalogService } from './public-catalog.service';

describe('PublicCatalogService key-spec filters', () => {
  const make = (matching: string[]) => {
    const prisma = {
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      productRevision: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const pricing = { getPublicPrices: jest.fn().mockResolvedValue(new Map()) };
    const keySpecs = { matchingProductIds: jest.fn().mockResolvedValue(matching), facets: jest.fn() };
    return { service: new PublicCatalogService(prisma as any, pricing as any, undefined, keySpecs as any), prisma, keySpecs };
  };

  it('keeps the visibility rule and narrows by the matching ids', async () => {
    const { service, prisma, keySpecs } = make(['a', 'b']);
    await service.search({ keySpec: ['total_ports:10'] });
    expect(keySpecs.matchingProductIds).toHaveBeenCalledWith([{ specKey: 'total_ports', value: '10' }]);
    const where = prisma.product.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([{ id: { in: ['a', 'b'] } }]));
    expect(where.AND[0]).toHaveProperty('OR');
  });

  it('returns an empty page without querying products when nothing matches', async () => {
    const { service, prisma } = make([]);
    const res = await service.search({ keySpec: ['total_ports:10'], offset: 0, limit: 5 });
    expect(res).toEqual({ data: [], meta: { total: 0, offset: 0, limit: 5 } });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed filter', async () => {
    const { service } = make([]);
    await expect(service.search({ keySpec: ['oops'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not touch key specs when no filter is given', async () => {
    const { service, keySpecs } = make([]);
    await service.search({});
    expect(keySpecs.matchingProductIds).not.toHaveBeenCalled();
  });
});
