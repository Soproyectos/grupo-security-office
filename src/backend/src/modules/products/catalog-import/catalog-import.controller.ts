import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireGrant } from '../../../common/security/require-grant';
import { CatalogImportService, CatalogImportKind } from './catalog-import.service';

@ApiTags('Products - Importador de catálogo')
@ApiBearerAuth()
@Controller('api/products/catalog-import')
@UseGuards(JwtAuthGuard)
@RequireGrant('products:write')
export class CatalogImportController {
  constructor(private readonly service: CatalogImportService) {}

  private actor(req: any) {
    return { id: req.user?.sub ?? req.user?.id, roles: req.user?.roles ?? [] };
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'kind'], properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: ['categories', 'brands', 'products'] } } } })
  preview(@UploadedFile() file: Express.Multer.File, @Body('kind') kind: CatalogImportKind, @Req() req: any) {
    if (!file) throw new BadRequestException({ code: 'CATALOG_IMPORT_FILE_REQUIRED', message: 'Adjunte un archivo para importar.' });
    if (!['categories', 'brands', 'products'].includes(kind)) throw new BadRequestException({ code: 'CATALOG_IMPORT_KIND_INVALID', message: 'Seleccione categorías, marcas o productos.' });
    return this.service.preview(file.buffer, file.originalname, kind, this.actor(req));
  }

  @Post('execute')
  execute(@Body() body: { previewId?: string; confirmNewEntities?: boolean }, @Req() req: any) {
    return this.service.execute(body?.previewId, body?.confirmNewEntities === true, this.actor(req));
  }
}
