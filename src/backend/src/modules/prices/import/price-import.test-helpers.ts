/**
 * In-memory fakes for the price import specs (products with listaId, tariffs,
 * prices, revisions, rows) and a fake grants provider. They implement only the
 * Prisma surface the price import service uses, with the subset of `where`
 * operators it relies on. Not a general Prisma mock.
 */
export interface FakeProduct { id: string; sku: string; listaId: string | null; name?: string }
export interface FakeTariff {
  id: string; code: string; isActive?: boolean; currency?: string;
  validFrom?: Date | null; validUntil?: Date | null;
}
export interface FakePrice { productId: string; priceListId: string; value: number | string; currency?: string; listaId?: string | null }
export interface FakeGrant { sourceId: string; actionId: string; scope: 'global' | 'list' | 'own' | 'team'; resourceId?: string }

export interface PriceImportFakeSeed {
  products?: FakeProduct[];
  tariffs?: FakeTariff[];
  prices?: FakePrice[];
}

type Where = Record<string, any>;

function matchesScalar(actual: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    if ('in' in cond) {
      const insensitive = cond.mode === 'insensitive';
      const list = (cond.in as any[]).map((v) => (insensitive && typeof v === 'string' ? v.toLowerCase() : v));
      const value = insensitive && typeof actual === 'string' ? actual.toLowerCase() : actual;
      return list.includes(value);
    }
    if ('not' in cond) return actual !== cond.not;
    if ('equals' in cond) return actual === cond.equals;
    return true;
  }
  return actual === cond;
}

function matches(row: Record<string, any>, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => matchesScalar(row[key], cond));
}

function table<T extends Record<string, any>>(rows: T[]) {
  return {
    rows,
    findMany: jest.fn(async (args: { where?: Where; orderBy?: any; skip?: number; take?: number } = {}) => {
      let out = rows.filter((r) => matches(r, args.where));
      if (args.skip) out = out.slice(args.skip);
      if (args.take !== undefined) out = out.slice(0, args.take);
      return out.map((r) => ({ ...r }));
    }),
    findFirst: jest.fn(async (args: { where?: Where } = {}) => {
      const hit = rows.find((r) => matches(r, args.where));
      return hit ? { ...hit } : null;
    }),
    findUnique: jest.fn(async (args: { where: Where }) => {
      const hit = rows.find((r) => matches(r, args.where));
      return hit ? { ...hit } : null;
    }),
    count: jest.fn(async (args: { where?: Where } = {}) => rows.filter((r) => matches(r, args.where)).length),
  };
}

export function createGrantsProvider(initial: FakeGrant[] = []) {
  const grants = [...initial];
  return {
    grants,
    grantsForUser: jest.fn(async () => grants.map((g) => ({ ...g }))),
    grant(...actionIds: string[]) {
      for (const actionId of actionIds) grants.push({ sourceId: 'fake-source', actionId, scope: 'global' });
    },
    revoke(actionId: string) {
      for (let i = grants.length - 1; i >= 0; i--) if (grants[i].actionId === actionId) grants.splice(i, 1);
    },
  };
}

export function createPriceImportFake(seed: PriceImportFakeSeed = {}) {
  const products = (seed.products ?? []).map((p) => ({ ...p }));
  const tariffs = (seed.tariffs ?? []).map((t) => ({
    isActive: true, currency: 'COP', validFrom: null, validUntil: null, ...t,
  }));
  const prices = (seed.prices ?? []).map((p) => ({ currency: 'COP', listaId: null, ...p }));
  const revisions: Record<string, any>[] = [];
  const revisionRows: Record<string, any>[] = [];
  const revisionPrices: Record<string, any>[] = [];
  let sequence = 0;

  const prisma: any = {
    product: {
      ...table(products),
      update: jest.fn(async ({ where, data }: { where: Where; data: Where }) => {
        const hit = products.find((p) => matches(p, where));
        if (!hit) throw new Error('fake product not found');
        Object.assign(hit, data);
        return { ...hit };
      }),
    },
    priceList: table(tariffs),
    price: {
      ...table(prices),
      create: jest.fn(async ({ data }: { data: any }) => { prices.push({ currency: 'COP', listaId: null, ...data }); return data; }),
      update: jest.fn(async ({ where, data }: { where: Where; data: any }) => {
        const key = where.productId_priceListId ?? where;
        const hit = prices.find((p) => p.productId === key.productId && p.priceListId === key.priceListId);
        if (!hit) throw new Error('fake price not found');
        Object.assign(hit, data);
        return { ...hit };
      }),
    },
    priceImportRevision: {
      ...table(revisions),
      create: jest.fn(async ({ data }: { data: any }) => {
        const row = { id: `rev-${++sequence}`, status: 'GUARDADA', createdAt: new Date(), updatedAt: new Date(), ...data };
        revisions.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: { where: Where; data: any }) => {
        const hit = revisions.find((r) => matches(r, where));
        if (!hit) throw new Error('fake revision not found');
        Object.assign(hit, data, { updatedAt: new Date() });
        return { ...hit };
      }),
    },
    priceImportRevisionRow: {
      ...table(revisionRows),
      createMany: jest.fn(async ({ data }: { data: any[] }) => { revisionRows.push(...data.map((d) => ({ id: `row-${++sequence}`, ...d }))); return { count: data.length }; }),
    },
    priceImportRevisionPrice: {
      ...table(revisionPrices),
      createMany: jest.fn(async ({ data }: { data: any[] }) => { revisionPrices.push(...data.map((d) => ({ id: `rp-${++sequence}`, ...d }))); return { count: data.length }; }),
    },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };

  return {
    prisma,
    audit: { log: jest.fn().mockResolvedValue({}), logTx: jest.fn().mockResolvedValue({}) },
    state: { products, tariffs, prices, revisions, revisionRows, revisionPrices },
  };
}
