import 'reflect-metadata';
import { PortalAuthService } from './portal-auth.service';

const build = (env: Record<string, string>) =>
  new PortalAuthService({ get: (k: string) => env[k] } as any, {} as any, { configured: false } as any);

describe('PortalAuthService production guards', () => {
  it('fails in production without BETTER_AUTH_SECRET', () => {
    expect(() => build({ NODE_ENV: 'production', PORTAL_AUTH_URL: 'https://x.co' })).toThrow('BETTER_AUTH_SECRET');
  });
  it('fails in production without a public URL', () => {
    expect(() => build({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'a'.repeat(40) })).toThrow('PORTAL_AUTH_URL');
  });
  it('fails in production without TURNSTILE_SECRET_KEY', () => {
    expect(() => build({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'a'.repeat(40), PORTAL_AUTH_URL: 'https://x.co' }))
      .toThrow('TURNSTILE_SECRET_KEY es obligatoria en producción');
  });
  // The positive case needs the ESM better-auth package, which Jest cannot load; it is covered by scripts/smoke-portal-auth.mjs.
});
