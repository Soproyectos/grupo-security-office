import { createPrismaMock } from '../../__test__/mocks/prisma.mock';
import { fakePriceFindMany, FakePriceRow } from '../../__test__/helpers/fake-price-db';
import { PublicPricingService } from './public-pricing.service';

const DAY = 24 * 60 * 60 * 1000;
const past = new Date(Date.now() - 30 * DAY);
const longPast = new Date(Date.now() - 60 * DAY);
const future = new Date(Date.now() + 30 * DAY);

/** ConfigService hermético: no depende del process.env de quien corre la prueba. */
const makeConfig = (env: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => env[key]) }) as any;

/**
 * BD falsa con la lista pública y TODAS las listas internas que hoy existen
 * en el servidor, para probar que nunca se filtran.
 */
const PUBLIC = { code: 'CLIENTE_FINAL_IVA' };
const internalRows = (productId: string): FakePriceRow[] => [
  { productId, value: '1', list: { code: 'INSTALADOR_IVA' } },
  { productId, value: '2', list: { code: 'TIENDA_IVA' } },
  { productId, value: '3', list: { code: 'DPP_ORO_IVA' } },
  { productId, value: '4', list: { code: 'DPP_PLATINO_IVA' } },
  { productId, value: '5', list: { code: 'ORO_SIN_IVA' } },
  { productId, value: '6', list: { code: 'INSTALLER_SIN_IVA' } },
];

describe('PublicPricingService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;

  const build = (rows: FakePriceRow[], env: Record<string, string | undefined> = {}) => {
    prisma = createPrismaMock();
    prisma.price.findMany.mockImplementation(fakePriceFindMany(rows));
    return new PublicPricingService(prisma as any, makeConfig(env));
  };

  it('consulta una sola vez, solo con el código público, lista activa y ambas vigencias', async () => {
    const service = build([]);

    await service.getPublicPrices(['p1', 'p2', 'p1']);

    expect(prisma.price.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.price.findMany.mock.calls[0][0];
    expect(args.where.productId).toEqual({ in: ['p1', 'p2'] });
    expect(args.where.priceList).toEqual(
      expect.objectContaining({ code: 'CLIENTE_FINAL_IVA', isActive: true }),
    );
    // Ventanas de vigencia tanto en la lista como en el precio (null = abierta).
    expect(args.where.priceList.AND).toHaveLength(2);
    expect(args.where.AND).toHaveLength(2);
    expect(JSON.stringify(args.where.AND)).toContain('validFrom');
    expect(JSON.stringify(args.where.AND)).toContain('validUntil');
    // Solo columnas públicas: nada de listas, costos ni ACL.
    expect(args.select).toEqual({ productId: true, value: true, currency: true });
  });

  it('no consulta la BD cuando no hay ids', async () => {
    const service = build([]);

    expect((await service.getPublicPrices([])).size).toBe(0);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('devuelve el precio público como número y null para productos sin precio', async () => {
    const service = build([
      { productId: 'p1', value: '612243.50', currency: 'COP', list: PUBLIC },
    ]);

    const prices = await service.getPublicPrices(['p1', 'p2']);

    expect(prices.get('p1')).toEqual({ value: 612243.5, currency: 'COP' });
    expect(prices.has('p2')).toBe(true);
    expect(prices.get('p2')).toBeNull();
  });

  it('convierte un Decimal de Prisma a number', async () => {
    const decimal = { toString: () => '219500000.00', valueOf: () => '219500000.00' };
    const service = build([{ productId: 'p1', value: decimal, list: PUBLIC }]);

    expect(await service.getPublicPrice('p1')).toEqual({ value: 219500000, currency: 'COP' });
  });

  it('un valor cero o no numérico no es un precio público', async () => {
    const service = build([
      { productId: 'p1', value: '0', list: PUBLIC },
      { productId: 'p2', value: 'abc', list: PUBLIC },
    ]);

    const prices = await service.getPublicPrices(['p1', 'p2']);

    expect(prices.get('p1')).toBeNull();
    expect(prices.get('p2')).toBeNull();
  });

  it('excluye precios vencidos o que aún no inician, e incluye los de vigencia abierta', async () => {
    const service = build([
      { productId: 'expired', value: '100', list: PUBLIC, validUntil: past },
      { productId: 'notyet', value: '100', list: PUBLIC, validFrom: future },
      { productId: 'open', value: '100', list: PUBLIC, validFrom: past, validUntil: future },
      { productId: 'unbounded', value: '100', list: PUBLIC },
    ]);

    const prices = await service.getPublicPrices(['expired', 'notyet', 'open', 'unbounded']);

    expect(prices.get('expired')).toBeNull();
    expect(prices.get('notyet')).toBeNull();
    expect(prices.get('open')).toEqual({ value: 100, currency: 'COP' });
    expect(prices.get('unbounded')).toEqual({ value: 100, currency: 'COP' });
  });

  it('excluye la lista pública si está inactiva o fuera de su vigencia', async () => {
    const service = build([
      { productId: 'inactive', value: '100', list: { ...PUBLIC, isActive: false } },
      { productId: 'listExpired', value: '100', list: { ...PUBLIC, validUntil: past } },
      { productId: 'listFuture', value: '100', list: { ...PUBLIC, validFrom: future } },
      { productId: 'listOpen', value: '100', list: { ...PUBLIC, validFrom: longPast, validUntil: future } },
    ]);

    const prices = await service.getPublicPrices(['inactive', 'listExpired', 'listFuture', 'listOpen']);

    expect(prices.get('inactive')).toBeNull();
    expect(prices.get('listExpired')).toBeNull();
    expect(prices.get('listFuture')).toBeNull();
    expect(prices.get('listOpen')).toEqual({ value: 100, currency: 'COP' });
  });

  it('nunca devuelve una lista interna: sin lista pública el precio es null', async () => {
    const service = build(internalRows('p1'));

    expect(await service.getPublicPrice('p1')).toBeNull();
  });

  it('con varias listas en la BD devuelve solo el valor de la lista pública', async () => {
    const service = build([
      ...internalRows('p1'),
      { productId: 'p1', value: '999000', currency: 'COP', list: PUBLIC },
    ]);

    const price = await service.getPublicPrice('p1');

    expect(price).toEqual({ value: 999000, currency: 'COP' });
    expect(Object.keys(price!).sort()).toEqual(['currency', 'value']);
  });

  it('PUBLIC_PRICE_LIST_CODE reemplaza el código y deja de leer CLIENTE_FINAL_IVA', async () => {
    const rows: FakePriceRow[] = [
      { productId: 'p1', value: '111', list: { code: 'CLIENTE_FINAL_IVA' } },
      { productId: 'p1', value: '222', list: { code: 'LISTA_PUBLICA_B' } },
    ];
    const service = build(rows, { PUBLIC_PRICE_LIST_CODE: '  LISTA_PUBLICA_B ' });

    expect(service.priceListCode).toBe('LISTA_PUBLICA_B');
    expect(await service.getPublicPrice('p1')).toEqual({ value: 222, currency: 'COP' });
    expect(prisma.price.findMany.mock.calls[0][0].where.priceList.code).toBe('LISTA_PUBLICA_B');
  });

  it('un PUBLIC_PRICE_LIST_CODE vacío cae al código por defecto', () => {
    expect(build([], { PUBLIC_PRICE_LIST_CODE: '   ' }).priceListCode).toBe('CLIENTE_FINAL_IVA');
    expect(build([], {}).priceListCode).toBe('CLIENTE_FINAL_IVA');
  });
});
