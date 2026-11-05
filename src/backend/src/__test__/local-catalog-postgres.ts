/** These integration suites must never inherit the application's DATABASE_URL. */
export function localCatalogTestUrl(kind: 'race' | 'backfill'): string {
  const value = process.env[`CATALOG_${kind.toUpperCase()}_TEST_URL`]
    ?? `postgresql://pgtest@127.0.0.1:55433/mt_close_tests_${kind}?schema=public`;
  const url = new URL(value);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55433'
    || url.username !== 'pgtest' || url.password || url.hash || url.search !== '?schema=public'
    || !new RegExp(`^/mt_close_tests_${kind}(?:_[0-9a-f]{6})?$`).test(url.pathname)) {
    throw new Error('Refusing non-local catalog test database. Use npm run test:catalog:regression.');
  }
  return value;
}

export async function assertLocalCatalogDatabase(client: { $queryRawUnsafe: (sql: string) => Promise<unknown> }, expectedUrl: string): Promise<void> {
  const rows = await client.$queryRawUnsafe('SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port') as Array<{ db: string; host: string; port: number }>;
  if (rows[0]?.db !== new URL(expectedUrl).pathname.slice(1) || !['127.0.0.1', '127.0.0.1/32'].includes(rows[0]?.host) || rows[0]?.port !== 55433) {
    throw new Error('Refusing catalog test writes: server identity does not match the local fixture.');
  }
}
