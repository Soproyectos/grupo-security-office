import { isIP } from 'node:net';
import type { PoolConfig } from 'pg';

export type BibliotecaConfig = { mode: 'legacy'; writesFrozen: boolean } | {
  mode: 'dedicated';
  writesFrozen: boolean;
  database: string;
  serverIp: string;
  cluster: string;
  pool: PoolConfig;
};

/** Dedicated mode is confined to isolated development until a production cut is approved. */
export function buildBibliotecaConfig(env: NodeJS.ProcessEnv): BibliotecaConfig {
  const frozen = env.LIBRARY_WRITES_FROZEN ?? 'false';
  if (!['true', 'false'].includes(frozen)) throw new Error('LIBRARY_WRITES_FROZEN must be true or false');
  const writesFrozen = frozen === 'true';
  const mode = env.LIBRARY_DATABASE_MODE ?? 'legacy';
  if (mode === 'legacy') return { mode, writesFrozen };
  if (mode !== 'dedicated') throw new Error('LIBRARY_DATABASE_MODE must be legacy or dedicated');
  if (!['development', 'test'].includes(env.NODE_ENV ?? '')) {
    throw new Error('Dedicated library mode requires an isolated development/test environment');
  }
  if (!env.LIBRARY_DATABASE_URL) throw new Error('LIBRARY_DATABASE_URL is required in dedicated mode');
  let url: URL;
  try { url = new URL(env.LIBRARY_DATABASE_URL); }
  catch { throw new Error('LIBRARY_DATABASE_URL must be a valid PostgreSQL test URL'); }
  const database = url.pathname.slice(1);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !/^gs-test-[a-z0-9-]+$/.test(url.hostname)
      || !/^gs_test_biblioteca_[a-z0-9_]+$/.test(database)
      || url.username !== 'gs_it' || !url.password
      || !['', '5432'].includes(url.port) || url.search || url.hash) {
    throw new Error('LIBRARY_DATABASE_URL must target the isolated gs-test library with gs_it and no URL options');
  }
  if (env.LIBRARY_DATABASE_TLS !== 'disabled') {
    throw new Error('LIBRARY_DATABASE_TLS=disabled must be explicit for this isolated test connection');
  }
  const serverIp = env.LIBRARY_TEST_SERVER_IP ?? '';
  const cluster = env.LIBRARY_TEST_CLUSTER_NAME ?? '';
  if (isIP(serverIp) !== 4 || !/^gs-test-[a-z0-9_-]{1,55}$/.test(cluster)) {
    throw new Error('LIBRARY_TEST_SERVER_IP and LIBRARY_TEST_CLUSTER_NAME must identify the exclusive test server');
  }
  return {
    mode,
    writesFrozen,
    database,
    serverIp,
    cluster,
    pool: {
      connectionString: url.toString(),
      max: 3,
      connectionTimeoutMillis: 5000,
      ssl: false,
      options: '-c search_path=public,pg_catalog -c statement_timeout=60000 -c lock_timeout=5000',
    },
  };
}
