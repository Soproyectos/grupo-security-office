import { X509Certificate } from 'node:crypto';
import type { PoolConfig } from 'pg';

/** Build a verified TLS connection for PostgreSQL's JS driver. */
export function buildPgPoolConfig(databaseUrl: string, encodedCa: string | undefined): PoolConfig {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when DATABASE_DRIVER=pg');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is invalid when DATABASE_DRIVER=pg');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL with a hostname');
  }

  // node-postgres replaces an explicit `ssl` object when the URL contains
  // sslmode/sslcert/sslkey/sslrootcert. Keep the supplied CA authoritative.
  for (const key of ['ssl', 'sslcert', 'sslkey', 'sslrootcert', 'host']) {
    if (url.searchParams.has(key)) {
      throw new Error(`DATABASE_URL parameter ${key} is not allowed with DATABASE_DRIVER=pg`);
    }
  }

  const sslMode = url.searchParams.get('sslmode');
  if (sslMode && !['require', 'verify-full'].includes(sslMode)) {
    throw new Error('DATABASE_URL must use sslmode=require or sslmode=verify-full with DATABASE_DRIVER=pg');
  }
  url.searchParams.delete('sslmode');

  if (!encodedCa || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedCa)) {
    throw new Error('DATABASE_SSL_CA_BASE64 must contain a base64-encoded PEM certificate');
  }

  const ca = Buffer.from(encodedCa, 'base64').toString('utf8');
  try {
    const certificate = new X509Certificate(ca);
    if (!certificate.ca) throw new Error('Not a CA certificate');
  } catch {
    throw new Error('DATABASE_SSL_CA_BASE64 must contain a valid CA PEM certificate');
  }

  return {
    connectionString: url.toString(),
    max: 5,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: url.hostname,
    },
  };
}
