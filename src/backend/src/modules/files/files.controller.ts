import { Controller, Get, Param, NotFoundException, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { FilesService } from './files.service';

@ApiTags('files')
@Controller('api/files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Sirve un archivo subido (imagen de producto, logo de marca)' })
  @ApiResponse({ status: 200, description: 'Bytes del archivo' })
  @ApiResponse({ status: 404, description: 'Archivo no encontrado' })
  async serve(@Param('id') id: string, @Res() res: Response) {
    const file = await this.filesService.get(id);
    if (!file) throw new NotFoundException('Archivo no encontrado');

    res.set({
      'Content-Type': file.mimeType,
      // Contenido inmutable por id (cada subida genera un id nuevo).
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Assets públicos e inmutables; se embeben desde un origen distinto (dev.* -> api-dev.*).
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(file.data);
  }
}
