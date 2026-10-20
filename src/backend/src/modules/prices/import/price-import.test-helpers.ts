/**
 * In-memory fakes for the price import specs (products with listaId, tariffs,
 * prices, revisions, rows) and a fake grants provider. They implement only the
 * Prisma surface the price import service uses, with the subset of `where`
 * operators it relies on. Not a general Prisma mock.
 */
export interface FakeProduct { id: string; sku: string; listaId: string | null; name?: string }
export interface FakeLista {
  id: string; code: string; name: string; isActive?: boolean; archivedAt?: Date | null;
  deletionStatus?: string | null; currency?: string;
}
export interface FakeRestriction { userId: string; resourceType: 'PRODUCT'; resourceId: string; isActive: false }
export interface FakeTariff {
  id: string; code: string; isActive?: boolean; currency?: string;
  validFrom?: Date | null; validUntil?: Date | null;
}
export interface FakePrice { id?: string; productId: string; priceListId: string; value: number | string; currency?: string; listaId?: string | null }
export interface FakeGrant { sourceId: string; actionId: string; scope: 'global' | 'list' | 'own' | 'team'; resourceId?: string }

export interface PriceImportFakeSeed {
  listas?: FakeLista[];
  restrictions?: FakeRestriction[];
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

/** Hook so `rows: { some: ... }` filters on revisions can join the fake rows table. */
let relationRows: (revisionId: string) => Record<string, any>[] = () => [];

function matches(row: Record<string, any>, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    if (key === 'rows' && cond && typeof cond === 'object' && 'some' in cond) {
      return relationRows(row.id).some((r) => matches(r, cond.some));
    }
    return matchesScalar(row[key], cond);
  });
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
    /** Grants the actions only on one lista (scope `list`). */
    grantOnLista(listaId: string, ...actionIds: string[]) {
      for (const actionId of actionIds) grants.push({ sourceId: 'fake-source', actionId, scope: 'list', resourceId: listaId });
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
  const prices = (seed.prices ?? []).map((p) => ({ currency: 'COP', listaId: null, ...p } as Record<string, any>));
  const listas = (seed.listas ?? []).map((l) => ({ isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP', ...l }));
  const restrictions = [...(seed.restrictions ?? [])];
  const revisions: Record<string, any>[] = [];
  const revisionRows: Record<string, any>[] = [];
  const revisionPrices: Record<string, any>[] = [];
  const productChanges: Record<string, any>[] = [];
  let sequence = 0;
  let revisionSequence = 0;
  let priceSequence = 0;
  for (const p of prices) p.id = p.id ?? `price-${++priceSequence}`;
  relationRows = (revisionId) => revisionRows.filter((r) => r.revisionId === revisionId);

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
    lista: table(listas),
    assignment: table(restrictions),
    productChange: {
      rows: productChanges,
      createMany: jest.fn(async ({ data }: { data: any[] }) => { productChanges.push(...data.map((d) => ({ id: `pc-${++sequence}`, createdAt: new Date(), ...d }))); return { count: data.length }; }),
    },
    // Tagged SQL used by findProductMatchesBySkus (normalized SKU match) and the FOR UPDATE product lock.
    $queryRaw: jest.fn(async (query: { strings?: readonly string[]; sql?: string; values: unknown[] }) => {
      const text = (query.strings ?? [query.sql ?? '']).join('?');
      if (text.includes('regexp_replace')) {
        const wanted = new Set(query.values[0] as string[]);
        return products.filter((p) => wanted.has(p.sku.replace(/\s/g, '').toUpperCase())).map((p) => ({ id: p.id, sku: p.sku }));
      }
      if (text.includes('FOR UPDATE')) {
        const ids = new Set(query.values[0] as string[]);
        return products.filter((p) => ids.has(p.id)).sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({ id: p.id, sku: p.sku, listaId: p.listaId }));
      }
      throw new Error(`unexpected raw query: ${text}`);
    }),
    price: {
      ...table(prices),
      create: jest.fn(async ({ data }: { data: any }) => { const row = { id: `price-${++priceSequence}`, currency: 'COP', listaId: null, ...data }; prices.push(row); return { ...row }; }),
      update: jest.fn(async ({ where, data }: { where: Where; data: any }) => {
        const key = where.productId_priceListId ?? where;
        const hit = where.id ? prices.find((p) => p.id === where.id)
          : prices.find((p) => p.productId === key.productId && p.priceListId === key.priceListId);
        if (!hit) throw new Error('fake price not found');
        Object.assign(hit, data);
        return { ...hit };
      }),
    },
    priceImportRevision: {
      ...table(revisions),
      create: jest.fn(async ({ data }: { data: any }) => {
        const row = { id: `rev-${++revisionSequence}`, status: 'GUARDADA', createdAt: new Date(), updatedAt: new Date(), ...data };
        revisions.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: { where: Where; data: any }) => {
        const hit = revisions.find((r) => matches(r, where));
        if (!hit) throw new Error('fake revision not found');
        Object.assign(hit, data, { updatedAt: new Date() });
        return { ...hit };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: any }) => {
        const hits = revisions.filter((r) => matches(r, where));
        for (const hit of hits) Object.assign(hit, data, { updatedAt: new Date() });
        return { count: hits.length };
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
    // Interactive transactions roll the fake state back when the callback throws, like the database does.
    $transaction: jest.fn(async (arg: any) => {
      if (typeof arg !== 'function') return Promise.all(arg);
      const tables = [prices, revisions, revisionRows, revisionPrices, productChanges, products];
      const snapshot = tables.map((t) => t.map((r) => ({ ...r })));
      try {
        return await arg(prisma);
      } catch (error) {
        tables.forEach((t, i) => { t.splice(0, t.length, ...snapshot[i]); });
        throw error;
      }
    }),
  };

  return {
    prisma,
    audit: { log: jest.fn().mockResolvedValue({}), logTx: jest.fn().mockResolvedValue({}) },
    state: { products, listas, tariffs, prices, revisions, revisionRows, revisionPrices, productChanges },
  };
}
