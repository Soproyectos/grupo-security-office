import { rootCertificates } from 'node:tls';
import { buildPgPoolConfig } from './prisma-pg-config';

const url = 'postgresql://postgres.example:secret@pooler.example.com:5432/postgres?sslmode=require';
const ca = rootCertificates[0];
const encodedCa = Buffer.from(ca).toString('base64');

describe('buildPgPoolConfig', () => {
  it('uses the supplied CA and validates the pooler hostname', () => {
    const config = buildPgPoolConfig(url, encodedCa);

    expect(config.connectionString).not.toContain('sslmode=');
    expect(config.ssl).toMatchObject({
      ca,
      rejectUnauthorized: true,
      servername: 'pooler.example.com',
    });
    expect(config.max).toBe(5);
  });

  it('accepts verify-full while keeping explicit TLS settings authoritative', () => {
    const config = buildPgPoolConfig(url.replace('sslmode=require', 'sslmode=verify-full'), encodedCa);
    expect(config.connectionString).not.toContain('sslmode=');
  });

  it.each([
    [undefined, 'base64-encoded'],
    ['', 'base64-encoded'],
    ['not-base64!', 'base64-encoded'],
    [Buffer.from('not a certificate').toString('base64'), 'valid CA PEM'],
  ])('rejects an absent or invalid CA', (value, message) => {
    expect(() => buildPgPoolConfig(url, value)).toThrow(message);
  });

  it.each([
    'sslmode=disable',
    'sslmode=prefer',
    'sslrootcert=%2Ftmp%2Fother.crt',
    'sslcert=%2Ftmp%2Fclient.crt',
    'ssl=0',
    'host=other.example.com',
  ])('rejects URL settings that could weaken or replace TLS (%s)', (parameter) => {
    const connectionString = `${url.split('?')[0]}?${parameter}`;
    expect(() => buildPgPoolConfig(connectionString, encodedCa)).toThrow();
  });
});
