import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { NotionAuthService } from './notion-auth.service';

@Controller('api/auth/notion')
export class NotionAuthController {
  constructor(private readonly notionAuth: NotionAuthService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  authorize(@Req() req: Request, @Res() res: Response) {
    const userId = req.user['sub'];
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const url = this.notionAuth.getAuthUrl(state);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    if (!code) {
      return res.redirect(`${this.getFrontendUrl()}/settings?notion=error&reason=no_code`);
    }

    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      userId = decoded.userId;
    } catch {
      return res.redirect(`${this.getFrontendUrl()}/settings?notion=error&reason=invalid_state`);
    }

    try {
      const tokens = await this.notionAuth.exchangeCodeForTokens(code);
      await this.notionAuth.saveTokens(userId, tokens);
      return res.redirect(`${this.getFrontendUrl()}/settings?notion=connected`);
    } catch (e) {
      return res.redirect(`${this.getFrontendUrl()}/settings?notion=error&reason=exchange_failed`);
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@Req() req: Request) {
    const userId = req.user['sub'];
    const info = await this.notionAuth.getTokenInfo(userId);
    return { connected: !!info, ...info };
  }

  @Get('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(@Req() req: Request, @Res() res: Response) {
    const userId = req.user['sub'];
    await this.notionAuth.revokeTokens(userId);
    return res.redirect(`${this.getFrontendUrl()}/settings?notion=disconnected`);
  }

  private getFrontendUrl(): string {
    return this.notionAuth['config'].get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }
}