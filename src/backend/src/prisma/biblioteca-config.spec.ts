import { buildBibliotecaConfig } from './biblioteca-config';

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LIBRARY_DATABASE_MODE: 'dedicated',
  LIBRARY_DATABASE_TLS: 'disabled',
  LIBRARY_DATABASE_URL: 'postgresql://gs_it:synthetic-only@gs-test-biblioteca-db:5432/gs_test_biblioteca_unit',
  LIBRARY_TEST_SERVER_IP: '172.23.0.2',
  LIBRARY_TEST_CLUSTER_NAME: 'gs-test-biblioteca-unit',
};

describe('isolated library configuration', () => {
  it('defaults to legacy without evaluating a second connection', () => {
    expect(buildBibliotecaConfig({ LIBRARY_DATABASE_URL: 'not-a-url' })).toEqual({ mode: 'legacy', writesFrozen: false });
  });

  it('builds an explicit, limited pool for the exclusive synthetic target', () => {
    expect(buildBibliotecaConfig(valid)).toMatchObject({
      mode: 'dedicated', database: 'gs_test_biblioteca_unit', serverIp: '172.23.0.2',
      cluster: 'gs-test-biblioteca-unit',
      pool: { ssl: false, max: 3, connectionTimeoutMillis: 5000 },
    });
  });

  it.each([
    { LIBRARY_DATABASE_MODE: 'typo' },
    { LIBRARY_WRITES_FROZEN: 'typo' },
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { LIBRARY_DATABASE_URL: undefined },
    { LIBRARY_DATABASE_URL: 'invalid' },
    { LIBRARY_DATABASE_TLS: undefined },
    { LIBRARY_TEST_SERVER_IP: 'not-an-ip' },
    { LIBRARY_TEST_CLUSTER_NAME: 'production' },
  ])('rejects unsafe or incomplete settings: %j', (override) => {
    expect(() => buildBibliotecaConfig({ ...valid, ...override })).toThrow();
  });

  it.each([
    'postgresql://gs_it:synthetic-only@gs-db:5432/gs_test_biblioteca_unit',
    'postgresql://gs_it:synthetic-only@gs-test-biblioteca-db:5432/grupo_security',
    'postgresql://other:synthetic-only@gs-test-biblioteca-db:5432/gs_test_biblioteca_unit',
    'postgresql://gs_it@gs-test-biblioteca-db:5432/gs_test_biblioteca_unit',
    'postgresql://gs_it:synthetic-only@gs-test-biblioteca-db:5433/gs_test_biblioteca_unit',
    'postgresql://gs_it:synthetic-only@gs-test-biblioteca-db:5432/gs_test_biblioteca_unit?sslmode=disable',
    'postgresql://gs_it:synthetic-only@gs-test-biblioteca-db:5432/gs_test_biblioteca_unit?host=gs-db',
    'https://gs_it:synthetic-only@gs-test-biblioteca-db/gs_test_biblioteca_unit',
  ])('rejects URL overrides and non-test destinations', (url) => {
    expect(() => buildBibliotecaConfig({ ...valid, LIBRARY_DATABASE_URL: url })).toThrow();
  });
});
