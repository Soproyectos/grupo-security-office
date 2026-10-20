import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductRevisionsService } from './product-revisions.service';

describe('ProductsController — alias limit/take en findAll', () => {
  let controller: ProductsController;
  let findAll: jest.Mock;

  const user = { sub: 'u1', roles: ['Super Admin'] };

  beforeEach(() => {
    findAll = jest.fn().mockResolvedValue({ data: [], meta: {} });
    controller = new ProductsController({ findAll } as unknown as ProductsService, {} as unknown as ProductRevisionsService);
  });

  it('?limit=10 sin take resuelve take=10', async () => {
    await controller.findAll({ limit: 10 } as any, user);
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }), expect.anything());
  });

  it('?limit=10&take=5 resuelve take=5 (take tiene precedencia)', async () => {
    await controller.findAll({ limit: 10, take: 5 } as any, user);
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }), expect.anything());
  });

  it('?take=20 sin limit mantiene take=20 (comportamiento actual)', async () => {
    await controller.findAll({ take: 20 } as any, user);
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }), expect.anything());
  });

  it('sin limit ni take mantiene el default take=50', async () => {
    await controller.findAll({} as any, user);
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }), expect.anything());
  });
});
