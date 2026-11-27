import { CanActivate, ExecutionContext, Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const CAPTCHA_HEADER = 'x-captcha-response';

/**
 * Cloudflare Turnstile check for the staff login (same header the portal uses).
 * - With TURNSTILE_SECRET_KEY: the token is mandatory and verified with Cloudflare.
 * - Without it outside production: skipped (local development), like the portal.
 * - Without it in production: refused, never silently skipped.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error('TURNSTILE_SECRET_KEY is not set in production: staff login refused');
        throw new ServiceUnavailableException('La verificación de seguridad no está disponible. Inténtalo más tarde.');
      }
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers[CAPTCHA_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new BadRequestException({ code: 'CAPTCHA_REQUIRED', message: 'Completa la verificación de seguridad para continuar.' });
    }
    const body = new URLSearchParams({ secret, response: token });
    if (req.ip) body.set('remoteip', req.ip);
    let success = false;
    try {
      const response = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
      success = Boolean(((await response.json()) as { success?: boolean }).success);
    } catch (error) {
      this.logger.warn(`Turnstile verification failed to run: ${(error as Error).message}`);
      throw new ServiceUnavailableException('No pudimos comprobar la verificación de seguridad. Inténtalo de nuevo.');
    }
    if (!success) {
      throw new BadRequestException({ code: 'CAPTCHA_INVALID', message: 'La verificación de seguridad falló o venció. Inténtalo de nuevo.' });
    }
    return true;
  }
}
