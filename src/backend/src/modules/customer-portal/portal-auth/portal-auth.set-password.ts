import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

/** Turns a Better Auth APIError from server-side setPassword into a Spanish HTTP error with a stable code. */
export function mapSetPasswordError(error: unknown): Error {
  const e = error as { statusCode?: number; status?: number | string; body?: { code?: string; message?: string } } | null;
  const status = typeof e?.statusCode === 'number' ? e.statusCode : typeof e?.status === 'number' ? e.status : 0;
  const code = e?.body?.code;
  if (status === 401) return new UnauthorizedException('Sesión de cliente finalizada');
  if (code === 'PASSWORD_ALREADY_SET') {
    return new BadRequestException({ code: 'PASSWORD_ALREADY_SET', message: 'Tu cuenta ya tiene contraseña. Puedes cambiarla en Mis datos.' });
  }
  if (status === 400) return new BadRequestException({ code: 'WEAK_PASSWORD', message: 'La contraseña no es válida. Elige otra.' });
  if (status >= 500 || status === 0) {
    // The leaked-password check could not run: fail closed rather than accept an unchecked password.
    return new ServiceUnavailableException({ code: 'PASSWORD_CHECK_UNAVAILABLE', message: 'No pudimos verificar tu contraseña ahora. Inténtalo de nuevo en unos minutos.' });
  }
  return error instanceof Error ? error : new Error('set-password failed');
}
