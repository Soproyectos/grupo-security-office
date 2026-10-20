import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotionCryptoService } from './notion-crypto.service';

export interface NotionTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  owner: { type: 'user'; user: { id: string; name: string; avatar_url: string } };
}

export interface NotionUserInfo {
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
}

@Injectable()
export class NotionAuthService {
  private readonly logger = new Logger(NotionAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: NotionCryptoService,
  ) {
    // Optional integration: missing credentials must not stop the whole API from booting.
    this.clientId = this.config.get<string>('NOTION_CLIENT_ID') ?? '';
    this.clientSecret = this.config.get<string>('NOTION_CLIENT_SECRET') ?? '';
    this.redirectUri = this.config.get<string>('NOTION_REDIRECT_URI') ?? '';
    if (!this.isConfigured()) {
      this.logger.warn('Notion integration disabled: NOTION_CLIENT_ID, NOTION_CLIENT_SECRET or NOTION_REDIRECT_URI is missing');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Notion integration is not configured');
    }
  }

  getAuthUrl(state?: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      owner: 'user',
    });
    if (state) params.set('state', state);
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<NotionTokenResponse> {
    this.assertConfigured();
    const res = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Notion token exchange failed: ${res.status} ${err}`);
      throw new Error(`Notion OAuth failed: ${err}`);
    }

    return res.json();
  }

  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    this.assertConfigured();
    const res = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Notion token refresh failed: ${res.status} ${err}`);
      throw new Error(`Notion token refresh failed: ${err}`);
    }

    return res.json();
  }

  async saveTokens(userId: string, tokens: NotionTokenResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.notionToken.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: this.crypto.encrypt(tokens.access_token),
        refreshToken: this.crypto.encrypt(tokens.refresh_token),
        workspaceId: tokens.workspace_id,
        workspaceName: tokens.workspace_name,
        botId: tokens.bot_id,
        expiresAt,
      },
      update: {
        accessToken: this.crypto.encrypt(tokens.access_token),
        refreshToken: this.crypto.encrypt(tokens.refresh_token),
        workspaceId: tokens.workspace_id,
        workspaceName: tokens.workspace_name,
        botId: tokens.bot_id,
        expiresAt,
      },
    });
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    const record = await this.prisma.notionToken.findUnique({ where: { userId } });
    if (!record) return null;

    if (record.expiresAt > new Date()) {
      return this.crypto.decrypt(record.accessToken);
    }

    try {
      const decryptedRefresh = this.crypto.decrypt(record.refreshToken);
      const { access_token, expires_in } = await this.refreshAccessToken(decryptedRefresh);
      const newExpiresAt = new Date(Date.now() + expires_in * 1000);
      await this.prisma.notionToken.update({
        where: { userId },
        data: {
          accessToken: this.crypto.encrypt(access_token),
          expiresAt: newExpiresAt,
        },
      });
      return access_token;
    } catch (e) {
      this.logger.warn(`Failed to refresh Notion token for user ${userId}: ${e}`);
      return null;
    }
  }

  async getTokenInfo(userId: string): Promise<NotionUserInfo | null> {
    const record = await this.prisma.notionToken.findUnique({ where: { userId } });
    if (!record) return null;
    return {
      bot_id: record.botId,
      workspace_id: record.workspaceId,
      workspace_name: record.workspaceName,
    };
  }

  async revokeTokens(userId: string): Promise<void> {
    await this.prisma.notionToken.delete({ where: { userId } }).catch(() => {});
  }
}