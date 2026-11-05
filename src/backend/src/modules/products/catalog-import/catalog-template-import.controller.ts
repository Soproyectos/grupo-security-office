import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireGrant } from '../../../common/security/require-grant';
import { CatalogTemplateImportService, TemplateActor } from './catalog-template-import.service';
import { ExecuteBodyDto, MappingBodyDto } from './catalog-template-import.types';
import { LIMITS } from './template';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Template-based catalog import. Only panel grants (global scope) decide: `imports:read` to consult/download,
 * `imports:run` (+ `products:write`, the dependency of editing sheets) to preview and apply. Super Admin keeps its exception.
 */
@ApiTags('Products - Importador por plantilla')
@ApiBearerAuth()
@Controller('api/catalog-import')
@UseGuards(JwtAuthGuard)
export class CatalogTemplateImportController {
  constructor(private readonly service: CatalogTemplateImportService) {}

  private actor(req: any): TemplateActor {
    return { id: req.user?.sub ?? req.user?.id, name: req.user?.name ?? null, roles: req.user?.roles ?? [] };
  }

  @Get('template')
  @RequireGrant('imports:read')
  @ApiOperation({ summary: 'Descargar la plantilla vigente (con las listas actuales de marcas, categorías y atributos).' })
  async template(@Res() res: Response) {
    const { buffer, fileName } = await this.service.template();
    this.send(res, buffer, fileName, XLSX_TYPE);
  }

  @Get('template/example')
  @RequireGrant('imports:read')
  @ApiOperation({ summary: 'Descargar el ejemplo sintético de la plantilla.' })
  example(@Res() res: Response) {
    const { buffer, fileName } = this.service.example();
    this.send(res, buffer, fileName, XLSX_TYPE);
  }

  @Post('preview')
  @RequireGrant('imports:run', 'products:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.maxFileBytes } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Validar el archivo y mostrar la vista previa. No guarda nada en el catálogo.' })
  preview(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException({ code: 'CATALOG_TEMPLATE_FILE_REQUIRED', message: 'Adjunte el archivo de la plantilla.' });
    return this.service.preview(file.buffer, file.originalname, this.actor(req));
  }

  @Patch('preview/:previewId/mapping')
  @RequireGrant('imports:run', 'products:write')
  @ApiOperation({ summary: 'Asociar textos del archivo (marca, categoría, subcategoría) con una opción existente y recalcular la vista previa.' })
  mapping(@Param('previewId') previewId: string, @Body() body: MappingBodyDto, @Req() req: any) {
    return this.service.resolveMapping(previewId, body.resolutions, this.actor(req));
  }

  @Post('execute/:previewId')
  @RequireGrant('imports:run', 'products:write')
  @ApiOperation({ summary: 'Confirmar la vista previa y aplicarla por lotes. Consulte el avance en progress/:batchId.' })
  execute(@Param('previewId') previewId: string, @Body() body: ExecuteBodyDto, @Req() req: any) {
    return this.service.execute(previewId, body?.confirmUnresolved, this.actor(req));
  }

  @Get('progress/:batchId')
  @RequireGrant('imports:read')
  @ApiOperation({ summary: 'Avance de una importación en curso o terminada.' })
  progress(@Param('batchId') batchId: string) {
    return this.service.progress(batchId);
  }

  @Get('batches')
  @RequireGrant('imports:read')
  @ApiOperation({ summary: 'Historial de importaciones (usuario, fecha, archivo, versión de plantilla, conteos, estado).' })
  batches(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.listBatches(Number(page), Number(pageSize));
  }

  @Get('batches/:batchId/results')
  @RequireGrant('imports:read')
  @ApiOperation({ summary: 'Resultado por producto en JSON (incluye códigos de incidencia).' })
  results(@Param('batchId') batchId: string) {
    return this.service.resultsView(batchId);
  }

  @Get('batches/:batchId/results/download')
  @RequireGrant('imports:read')
  @ApiOperation({ summary: 'Resultado por producto como archivo. format=xlsx (por defecto) o csv.' })
  async download(@Param('batchId') batchId: string, @Query('format') format: string | undefined, @Res() res: Response) {
    if (format && format !== 'xlsx' && format !== 'csv') throw new BadRequestException({ code: 'CATALOG_TEMPLATE_FORMAT_INVALID', message: 'El formato debe ser xlsx o csv.' });
    const file = await this.service.resultsFile(batchId, (format as 'xlsx' | 'csv') ?? 'xlsx');
    this.send(res, file.buffer, file.fileName, file.contentType);
  }

  private send(res: Response, buffer: Buffer, fileName: string, contentType: string) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // @Res() without passthrough: Nest does not apply the TransformInterceptor to the body.
    res.send(buffer);
  }
}
