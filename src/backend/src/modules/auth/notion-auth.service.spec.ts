import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotionAuthService } from './notion-auth.service';
import type { NotionCryptoService } from './notion-crypto.service';
import type { PrismaService } from '../../prisma/prisma.service';

const NOTION_KEYS = ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET', 'NOTION_REDIRECT_URI'] as const;

function buildService(env: Record<string, string>): NotionAuthService {
  const config = new ConfigService(env);
  return new NotionAuthService(config, {} as PrismaService, {} as NotionCryptoService);
}

describe('NotionAuthService configuration', () => {
  // ConfigService reads process.env before its own values; isolate from the host shell.
  const saved: Partial<Record<(typeof NOTION_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of NOTION_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of NOTION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('constructs without Notion credentials and reports itself as not configured', () => {
    const service = buildService({});

    expect(service.isConfigured()).toBe(false);
  });

  it('rejects OAuth operations with 503 when credentials are missing', async () => {
    const service = buildService({ NOTION_CLIENT_ID: 'id' });

    expect(() => service.getAuthUrl()).toThrow(ServiceUnavailableException);
    await expect(service.exchangeCodeForTokens('code')).rejects.toThrow(ServiceUnavailableException);
    await expect(service.refreshAccessToken('token')).rejects.toThrow(ServiceUnavailableException);
  });

  it('builds the authorization URL when fully configured', () => {
    const service = buildService({
      NOTION_CLIENT_ID: 'client-123',
      NOTION_CLIENT_SECRET: 'secret',
      NOTION_REDIRECT_URI: 'https://api.example.com/api/auth/notion/callback',
    });

    const url = new URL(service.getAuthUrl('state-1'));

    expect(service.isConfigured()).toBe(true);
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.com/api/auth/notion/callback');
    expect(url.searchParams.get('state')).toBe('state-1');
  });
});
