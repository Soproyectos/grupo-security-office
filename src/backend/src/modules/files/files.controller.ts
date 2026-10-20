import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { SessionService } from '../../common/security/session.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from './files.service';

/** Extrae el token de sesión (cookie httpOnly o Bearer), como `jwt.strategy`. */
function extractToken(req: Request): string | null {
  if (req?.cookies?.access_token) return req.cookies.access_token;
  const cookieHeader = req?.headers?.cookie;
  if (cookieHeader) {
    const match = /(?:^|;\s*)access_token=([^;]*)/.exec(cookieHeader);
    if (match) return decodeURIComponent(match[1]);
  }
  const authHeader = req?.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
  return null;
}

@ApiTags('files')
@Controller('api/files')
export class FilesController {
  constructor(
    private filesService: FilesService,
    private jwt: JwtService,
    private sessions: SessionService,
    private acl: AclService,
    private prisma: PrismaService,
  ) {}

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Sirve un archivo subido (imagen de producto, logo de marca)' })
  @ApiResponse({ status: 200, description: 'Bytes del archivo' })
  @ApiResponse({ status: 401, description: 'Archivo privado: se requiere sesión' })
  @ApiResponse({ status: 403, description: 'Archivo privado: sin acceso al producto dueño' })
  @ApiResponse({ status: 404, description: 'Archivo no encontrado' })
  async serve(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const file = await this.filesService.getRecord(id);
    if (!file) throw new NotFoundException('Archivo no encontrado');

    // CAT-04 (D4, caso «medio privado inaccesible por ID/URL directa»): la
    // ruta sigue siendo @Public PARA ARCHIVOS PÚBLICOS (los <img> de la tienda
    // se embeben cross-origin sin sesión); un archivo PRIVATE exige sesión
    // válida y acceso de lectura al producto dueño, con la misma dureza que
    // JwtStrategy (token de desafío rechazado, usuario activo, sesión viva).
    if (file.visibility === 'PRIVATE') {
      const ctx = await this.authorizePrivate(req);
      if (!file.ownerProductId) {
        // Fail-closed: privado sin dueño registrado no es descargable por nadie
        // salvo auditoría futura; nunca se sirve por URL opaca.
        throw new ForbiddenException('Archivo privado sin producto dueño');
      }
      await this.acl.assertProductAccess(file.ownerProductId, ctx, 'view');
      res.set({
        'Content-Type': file.mimeType,
        // Un medio privado jamás se cachea compartida.
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${file.id}"`,
      });
      return res.send(file.data);
    }

    res.set({
      'Content-Type': file.mimeType,
      // Contenido inmutable por id (cada subida genera un id nuevo).
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Assets públicos e inmutables; se embeben desde un origen distinto (dev.* -> api-dev.*).
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(file.data);
  }

  private async authorizePrivate(req: Request): Promise<AccessContext> {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('Se requiere sesión para este archivo');
    let payload: any;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida');
    }
    // Como jwt.strategy.validate: un token de desafío (scope 'mfa*') NO es sesión.
    if (payload.scope) throw new UnauthorizedException('Token de verificación, no de sesión');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Usuario no encontrado o inactivo');
    if (!(await this.sessions.isActive(payload.jti))) {
      throw new UnauthorizedException('Sesión finalizada. Inicie sesión de nuevo.');
    }
    return { userId: payload.sub, roles: Array.isArray(payload.roles) ? payload.roles : [] };
  }
}
