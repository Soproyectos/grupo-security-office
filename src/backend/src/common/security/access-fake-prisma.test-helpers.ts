/**
 * In-memory stand-in for the Prisma tables behind AccessAssignmentsService
 * (AccessState, AccessSource, AccessGrant, AccessOperation, AuditLog, User).
 * It understands exactly the `where` shapes the service uses, so specs can
 * exercise real assign / remove / read behavior without any database.
 * A failed transaction is rolled back, like the real one.
 */
export interface FakeSource {
  id: string;
  userId: string;
  kind: string;
  templateId: string | null;
  catalogVersion?: string;
  grantedById?: string;
  reason?: string | null;
}

export interface FakeGrant {
  sourceId: string;
  actionId: string;
  scopeKind: string;
  resourceId: string;
}

export interface FakeAccessState {
  sources: FakeSource[];
  grants: FakeGrant[];
  versions: Record<string, number>;
  operations: Array<Record<string, unknown>>;
  audits: Array<Record<string, any>>;
  users: Set<string>;
  nextId: number;
  /** One-shot delay for the next `accessSource.findMany` (slow remote tunnel). */
  sourceReadDelayMs: number;
}

type Where = Record<string, any>;

export function createFakeAccessPrisma(users: string[] = ['recipient-fixture']) {
  const state: FakeAccessState = {
    sources: [],
    grants: [],
    versions: {},
    operations: [],
    audits: [],
    users: new Set(users),
    nextId: 0,
    sourceReadDelayMs: 0,
  };

  const sourceOf = (grant: FakeGrant) => state.sources.find((source) => source.id === grant.sourceId) ?? null;
  const grantsOf = (source: FakeSource) => state.grants.filter((grant) => grant.sourceId === source.id);

  function matches(row: any, where: Where | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') return (condition as Where[]).some((entry) => matches(row, entry));
      if (key === 'source') return row ? matches(sourceOf(row), condition) : false;
      if (key === 'grants') return grantsOf(row).some((grant) => matches(grant, condition.some));
      if (row === null || row === undefined) return false;
      const value = row[key];
      if (condition && typeof condition === 'object') {
        if ('in' in condition) return (condition.in as unknown[]).includes(value);
        if ('not' in condition) return value !== condition.not;
        if ('startsWith' in condition) return String(value).startsWith(condition.startsWith);
        throw new Error(`Unsupported condition in fake prisma: ${JSON.stringify(condition)}`);
      }
      return value === condition;
    });
  }

  const copy = <T extends object>(row: T): T => ({ ...row });

  const tx = {
    accessState: {
      upsert: async ({ where }: { where: { userId: string } }) => {
        if (!(where.userId in state.versions)) state.versions[where.userId] = 0;
        return {};
      },
      updateMany: async ({ where }: { where: { userId: string; version: number } }) => {
        if (state.versions[where.userId] !== where.version) return { count: 0 };
        state.versions[where.userId] += 1;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { userId: string } }) =>
        where.userId in state.versions ? { version: state.versions[where.userId] } : null,
    },
    accessSource: {
      findMany: async ({ where }: { where?: Where } = {}) => {
        const delay = state.sourceReadDelayMs;
        state.sourceReadDelayMs = 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return state.sources.filter((source) => matches(source, where)).map(copy);
      },
      findFirst: async ({ where }: { where?: Where } = {}) => {
        const found = state.sources.find((source) => matches(source, where));
        return found ? copy(found) : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = state.sources.find((source) => source.id === where.id);
        return found ? copy(found) : null;
      },
      create: async ({ data }: { data: Omit<FakeSource, 'id'> }) => {
        state.nextId += 1;
        const created: FakeSource = { ...data, id: `src-${state.nextId}` };
        state.sources.push(created);
        return { id: created.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeSource> }) => {
        Object.assign(state.sources.find((source) => source.id === where.id)!, data);
        return { id: where.id };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.sources = state.sources.filter((source) => source.id !== where.id);
        state.grants = state.grants.filter((grant) => grant.sourceId !== where.id);
        return {};
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const hit = state.sources.filter((source) => matches(source, where)).map((source) => source.id);
        state.sources = state.sources.filter((source) => !hit.includes(source.id));
        state.grants = state.grants.filter((grant) => !hit.includes(grant.sourceId));
        return { count: hit.length };
      },
    },
    accessGrant: {
      findMany: async ({ where }: { where?: Where } = {}) =>
        state.grants.filter((grant) => matches(grant, where)).map(copy),
      deleteMany: async ({ where }: { where?: Where } = {}) => {
        const hit = state.grants.filter((grant) => matches(grant, where));
        state.grants = state.grants.filter((grant) => !hit.includes(grant));
        return { count: hit.length };
      },
      createMany: async ({ data }: { data: FakeGrant[] }) => {
        state.grants.push(...data.map(copy));
        return { count: data.length };
      },
    },
    accessOperation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.operations.push(data);
        return {};
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, any> }) => {
        state.audits.push(data);
        return {};
      },
    },
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.users.has(where.id) ? { id: where.id } : null,
    },
    accessSource: tx.accessSource,
    accessGrant: tx.accessGrant,
    accessState: tx.accessState,
    accessOperation: {
      findUnique: async ({ where }: { where: { actorType_actorId_idempotencyKey: { actorId: string; idempotencyKey: string } } }) => {
        const key = where.actorType_actorId_idempotencyKey;
        const found = state.operations.find(
          (operation) => operation.actorId === key.actorId && operation.idempotencyKey === key.idempotencyKey,
        );
        return found ?? null;
      },
    },
    $transaction: async <T>(
      callback: (transaction: typeof tx) => Promise<T>,
      options?: { timeout?: number },
    ): Promise<T> => {
      const snapshot = structuredClone({
        sources: state.sources,
        grants: state.grants,
        versions: state.versions,
        operations: state.operations,
        audits: state.audits,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          callback(tx),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Transaction expired')), options?.timeout ?? 5_000);
          }),
        ]);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };

  return { prisma, state };
}

export function fakeSource(
  id: string,
  kind: string,
  templateId: string | null = null,
  userId = 'recipient-fixture',
): FakeSource {
  return { id, userId, kind, templateId, catalogVersion: 'test', grantedById: 'admin-fixture', reason: null };
}

export function fakeGrant(sourceId: string, actionId: string, scopeKind = 'global', resourceId = ''): FakeGrant {
  return { sourceId, actionId, scopeKind, resourceId };
}
