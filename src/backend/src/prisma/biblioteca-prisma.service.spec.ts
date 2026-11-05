import { BibliotecaPrismaService, type BibliotecaClientFactory } from './biblioteca-prisma.service';
import { buildBibliotecaConfig } from './biblioteca-config';
import type { PrismaService } from './prisma.service';

jest.mock('./prisma.service', () => ({ PrismaService: class {} }));

const config = buildBibliotecaConfig({
  NODE_ENV: 'test', LIBRARY_DATABASE_MODE: 'dedicated', LIBRARY_DATABASE_TLS: 'disabled',
  LIBRARY_DATABASE_URL: 'postgresql://gs_it:synthetic-only@gs-test-biblioteca-db:5432/gs_test_biblioteca_unit',
  LIBRARY_TEST_SERVER_IP: '172.23.0.2', LIBRARY_TEST_CLUSTER_NAME: 'gs-test-biblioteca-unit',
});
const identity = {
  database: 'gs_test_biblioteca_unit', username: 'gs_it', session_username: 'gs_it',
  ip: '172.23.0.2', port: 5432, cluster: 'gs-test-biblioteca-unit', version: 180000,
  data_directory: '/var/lib/postgresql/18/docker', search_path: 'public, pg_catalog',
};

function fixture(rows: unknown[] = [identity]) {
  const client = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue(rows),
  };
  const legacy = { $connect: jest.fn(), $disconnect: jest.fn() } as unknown as PrismaService;
  const factory = jest.fn(() => client) as unknown as jest.MockedFunction<BibliotecaClientFactory>;
  const service = new BibliotecaPrismaService(legacy, config, factory);
  return { client, legacy, factory, service };
}

describe('library connection ownership and identity', () => {
  it('legacy reuses the exact operational client and never owns its lifecycle', async () => {
    const { legacy, factory } = fixture();
    const service = new BibliotecaPrismaService(legacy, { mode: 'legacy', writesFrozen: false }, factory);
    await service.onModuleInit();
    expect(service.client).toBe(legacy);
    await service.onModuleDestroy();
    expect(factory).not.toHaveBeenCalled();
    expect(legacy.$connect).not.toHaveBeenCalled();
    expect(legacy.$disconnect).not.toHaveBeenCalled();
  });

  it('exposes a dedicated client only after physical identity verification', async () => {
    const { client, service, factory } = fixture();
    expect(() => service.client).toThrow('identity');
    await service.onModuleInit();
    expect(service.client).toBe(client);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(client.$connect).toHaveBeenCalledTimes(1);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(() => service.client).toThrow('identity');
  });

  it.each([
    { database: 'grupo_security' }, { username: 'other' }, { session_username: 'other' },
    { ip: '172.23.0.99' }, { ip: null }, { port: 5433 }, { cluster: 'another-cluster' },
    { version: 170000 }, { version: 190000 }, { version: undefined },
    { data_directory: '/production' }, { search_path: 'public,other,pg_catalog' },
  ])('rejects a mismatched physical destination: %j', async (override) => {
    const { client, service } = fixture([{ ...identity, ...override }]);
    await expect(service.onModuleInit()).rejects.toThrow('identity verification failed');
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(() => service.client).toThrow('identity');
  });

  it.each([{ rows: [] }, { rows: [identity, identity] }])('rejects a missing or ambiguous identity response', async ({ rows }) => {
    const { service } = fixture(rows);
    await expect(service.onModuleInit()).rejects.toThrow('identity verification failed');
  });

  it('does not expose connection details on failure and never falls back to legacy', async () => {
    const { client, legacy, service } = fixture();
    client.$connect.mockRejectedValue(new Error('synthetic-private-connection-detail'));
    await expect(service.onModuleInit()).rejects.toThrow(/^Library database connection or identity verification failed$/);
    expect(legacy.$connect).not.toHaveBeenCalled();
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(() => service.client).toThrow('identity');
  });

  it('freezes writes before invoking a transaction but retains legacy reads', async () => {
    const { legacy, factory } = fixture();
    const service = new BibliotecaPrismaService(legacy, { mode: 'legacy', writesFrozen: true }, factory);
    const write = jest.fn();
    await expect(service.writeTransaction(write)).rejects.toMatchObject({
      response: { code: 'LIBRARY_WRITES_FROZEN' },
    });
    expect(write).not.toHaveBeenCalled();
    expect(service.client).toBe(legacy);
  });

  it('owns only active callback transactions, including the failure path', async () => {
    const tx = {};
    const legacy = { $transaction: jest.fn(async (work) => work(tx)) } as unknown as PrismaService;
    const service = new BibliotecaPrismaService(legacy, { mode: 'legacy', writesFrozen: false }, () => { throw new Error('Unexpected client'); });
    expect(service.ownsTransaction(tx)).toBe(false);
    await service.writeTransaction(async (actual) => {
      expect(actual).toBe(tx);
      expect(service.ownsTransaction(actual)).toBe(true);
    });
    expect(service.ownsTransaction(tx)).toBe(false);
    await expect(service.writeTransaction(async (actual) => {
      expect(service.ownsTransaction(actual)).toBe(true);
      throw new Error('synthetic failure');
    })).rejects.toThrow('synthetic failure');
    expect(service.ownsTransaction(tx)).toBe(false);
  });

  it('passes transaction options to the selected client and omits them when absent', async () => {
    const calls: unknown[][] = [];
    const legacy = { $transaction: jest.fn(async (fn: (tx: object) => Promise<unknown>, ...rest: unknown[]) => { calls.push(rest); return fn({}); }) } as unknown as PrismaService;
    const service = new BibliotecaPrismaService(legacy, { mode: 'legacy', writesFrozen: false }, jest.fn() as unknown as BibliotecaClientFactory);
    await service.writeTransaction(async () => 'a');
    await service.writeTransaction(async () => 'b', { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 120_000 });
    expect(calls[0]).toEqual([undefined]);
    expect(calls[1]).toEqual([{ isolationLevel: 'Serializable', maxWait: 10_000, timeout: 120_000 }]);
  });
});
