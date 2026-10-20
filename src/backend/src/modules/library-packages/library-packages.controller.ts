import { Controller, Get, Param, ParseUUIDPipe, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryPackagesService } from './library-packages.service';

@ApiTags('Library Packages')
@ApiBearerAuth()
@Controller('api/exports/bundles')
@UseGuards(JwtAuthGuard)
export class LibraryPackagesController {
  constructor(private readonly packages: LibraryPackagesService) {}

  private ctx(user: { sub?: string; id?: string; roles?: string[] }) {
    return { userId: user?.sub ?? user?.id ?? '', roles: user?.roles ?? [] };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un paquete propio con los permisos vigentes' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.packages.get(id, this.ctx(user));
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Descargar los bytes del paquete; vuelve a comprobar el alcance' })
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Res() response: Response) {
    const bundle = await this.packages.download(id, this.ctx(user));
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${bundle.filename}"`);
    response.setHeader('Content-Length', bundle.data.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Bundle-SHA256', bundle.sha256);
    response.send(bundle.data);
  }
}
