import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { TurnstileGuard } from './turnstile.guard';

function build(env: Record<string, string | undefined>, headers: Record<string, string> = {}) {
  const guard = new TurnstileGuard({ get: (key: string) => env[key] } as never);
  const context = { switchToHttp: () => ({ getRequest: () => ({ headers, ip: '1.2.3.4' }) }) } as never;
  return { guard, context };
}

describe('TurnstileGuard', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('skips the check without a secret outside production', async () => {
    const { guard, context } = build({ NODE_ENV: 'development' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses without a secret in production', async () => {
    const { guard, context } = build({ NODE_ENV: 'production' });
    await expect(guard.canActivate(context)).rejects.toThrow(ServiceUnavailableException);
  });

  it('requires the token when the secret exists', async () => {
    const { guard, context } = build({ TURNSTILE_SECRET_KEY: 's' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: 'CAPTCHA_REQUIRED' } });
  });

  it('accepts a token Cloudflare approves and sends the secret server-side', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    global.fetch = fetchMock as never;
    const { guard, context } = build({ TURNSTILE_SECRET_KEY: 's' }, { 'x-captcha-response': 'tok' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(String((fetchMock.mock.calls[0][1] as { body: URLSearchParams }).body)).toContain('secret=s');
  });

  it('rejects a token Cloudflare refuses', async () => {
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: false }) }) as never;
    const { guard, context } = build({ TURNSTILE_SECRET_KEY: 's' }, { 'x-captcha-response': 'bad' });
    await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const { guard, context } = build({ TURNSTILE_SECRET_KEY: 's' }, { 'x-captcha-response': 'tok' });
    await expect(guard.canActivate(context)).rejects.toThrow(ServiceUnavailableException);
  });
});
