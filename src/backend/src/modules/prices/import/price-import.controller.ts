import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PriceImportService } from './price-import.service';
import { MAX_XLSX_BYTES } from './xlsx-container';

export class PriceTemplateQueryDto {
  @IsUUID()
  listaId: string;
  @IsIn(['vacias', 'referencias'])
  mode: string;
  @IsOptional()
  @IsString()
  tariffs?: string;
}

export class PriceImportExportQueryDto {
  @ApiProperty({ description: 'Lista cuyas referencias y precios vigentes se exportan (IMP-07).' })
  @IsUUID()
  listaId: string;
  @IsOptional()
  @IsString()
  tariffs?: string;
}

export class PriceImportPreviewDto {
  @ApiProperty({ description: 'Lista existente a la que pertenecen las referencias del archivo.' })
  @IsUUID()
  listaId: string;
}

export class PriceImportRevisionSaveDto {
  @ApiProperty({ description: 'Lista existente a la que pertenece la revisión.' })
  @IsUUID()
  listaId: string;

  @ApiProperty({ description: 'Clave de idempotencia del cliente; repetirla no duplica la revisión.' })
  @IsString()
  idempotencyKey: string;
}

export class PriceImportRevisionListQueryDto {
  @ApiProperty({ description: 'Lista cuyas revisiones se consultan.' })
  @IsUUID()
  listaId: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class PriceImportRevisionPageQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

// ─── IMP-07B (07B) — perfiles de proveedor ───

export class ProviderProfileDto {
  @IsString()
  providerName: string;

  @IsString()
  sheet: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  headerRow: number;

  @IsIn(['', '.', ','])
  thousandsSeparator: string;

  @IsIn(['.', ','])
  decimalSeparator: string;

  @IsIn(['COP'])
  currency: string;

  @IsArray()
  @IsString({ each: true })
  tariffs: string[];

  @IsArray()
  @IsString({ each: true })
  expectedColumns: string[];
}

export class ProviderEquivalenceDto {
  @IsString()
  externalRef: string;

  @IsUUID()
  productId: string;
}

export class ProviderEquivalenceListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderEquivalenceDto)
  equivalences: ProviderEquivalenceDto[];
}

export class RecognizeProfileDto {
  @IsString()
  providerName: string;

  @IsArray()
  @IsString({ each: true })
  headers: string[];
}

export class ResolveReferencesDto {
  @IsArray()
  @IsString({ each: true })
  references: string[];
}

@ApiTags('Prices - Revisión de plantilla')
@ApiBearerAuth()
// Mismo stack global de la app (Jwt+Roles+Permissions). La autorización fina
// (concesiones) se revalida POR SOLICITUD en el servicio (LEEME 4/6).
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('Super Admin', 'Supervisor', 'Admin Comercial')
@Controller('api/prices/import')
export class PriceImportController {
  constructor(private service: PriceImportService) {}

  @Get('template')
  @ApiOperation({ summary: 'Descargar plantilla NUEVA (vacía o con referencias de esta lista; IMP-02).' })
  async downloadTemplate(
    @Query() dto: PriceTemplateQueryDto,
    @CurrentUser() user: { sub: string; roles: string[] },
    @Res() res: Response,
  ) {
    const tariffs = dto.tariffs
      ? dto.tariffs.split(',').map((t) => t.trim()).filter((t) => t !== '')
      : undefined;
    const { buffer, fileName } = await this.service.downloadTemplate(
      dto.listaId,
      dto.mode as 'vacias' | 'referencias',
      tariffs,
      { userId: user.sub, roles: user.roles },
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // @Res() sin passthrough: Nest no aplica el TransformInterceptor al cuerpo.
    res.send(buffer);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exportar referencias y precios vigentes de una lista (solo tarifas autorizadas; IMP-07).' })
  async exportLista(
    @Query() dto: PriceImportExportQueryDto,
    @CurrentUser() user: { sub: string; roles: string[] },
    @Res() res: Response,
  ) {
    const tariffs = dto.tariffs
      ? dto.tariffs.split(',').map((t) => t.trim()).filter((t) => t !== '')
      : undefined;
    const { buffer, fileName } = await this.service.exportListaPrices(dto.listaId, tariffs, {
      userId: user.sub,
      roles: user.roles,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    // @Res() sin passthrough: el TransformInterceptor no envuelve el Buffer.
    res.send(buffer);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Revisar precios con IVA sin crear productos ni modificar precios.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'listaId'], properties: {
    file: { type: 'string', format: 'binary' }, listaId: { type: 'string', format: 'uuid' },
  } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 1, parts: 3 } }))
  preview(@UploadedFile() file: Express.Multer.File, @Body() dto: PriceImportPreviewDto,
    @CurrentUser() user: { sub: string; roles: string[]; permissions: string[] }) {
    return this.service.preview(file, dto.listaId, { userId: user.sub, roles: user.roles });
  }

  @Post('revisions')
  @ApiOperation({ summary: 'Guardar una revisión de precios (imprescindible clave de idempotencia; NO aplica).' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'listaId', 'idempotencyKey'], properties: {
    file: { type: 'string', format: 'binary' }, listaId: { type: 'string', format: 'uuid' }, idempotencyKey: { type: 'string' },
  } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 2, parts: 4 } }))
  saveRevision(@UploadedFile() file: Express.Multer.File, @Body() dto: PriceImportRevisionSaveDto,
    @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.saveRevision(file, dto.listaId, dto.idempotencyKey, { userId: user.sub, roles: user.roles });
  }

  @Get('revisions')
  @ApiOperation({ summary: 'Listar las revisiones autorizadas de una lista (paginado).' })
  listRevisions(@Query() dto: PriceImportRevisionListQueryDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.listRevisions(dto.listaId, Number(dto.page), Number(dto.pageSize), { userId: user.sub, roles: user.roles });
  }

  @Get('revisions/:id')
  @ApiOperation({ summary: 'Ver una revisión (filas y precios guardados; paginado).' })
  getRevision(@Param('id') id: string, @Query() dto: PriceImportRevisionPageQueryDto,
    @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.getRevision(id, Number(dto.page), Number(dto.pageSize), { userId: user.sub, roles: user.roles });
  }

  @Get('revisions/:id/file')
  @ApiOperation({ summary: 'Descargar el archivo original de una revisión autorizada.' })
  async getRevisionFile(@Param('id') id: string, @CurrentUser() user: { sub: string; roles: string[] },
    @Res() res: Response) {
    const { buffer, fileName } = await this.service.getRevisionFile(id, { userId: user.sub, roles: user.roles });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    // @Res() sin passthrough: el TransformInterceptor no envuelve el Buffer.
    res.send(buffer);
  }

  @Post('revisions/:id/apply')
  @ApiOperation({ summary: 'Aplicar una revisión de precios (permiso separado; transacción atómica).' })
  applyRevision(@Param('id') id: string, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.applyRevision(id, { userId: user.sub, roles: user.roles });
  }

  @Delete('revisions/:id')
  @ApiOperation({ summary: 'Descartar una revisión pendiente (no aplica ni borra precios).' })
  discardRevision(@Param('id') id: string, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.discardRevision(id, { userId: user.sub, roles: user.roles });
  }

  // ─── IMP-07B (07B) — perfiles de proveedor (acciones providers:read/write) ───

  @Get('profiles')
  @ApiOperation({ summary: 'Listar los perfiles de proveedor guardados.' })
  listProfiles(@CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.listProviderProfiles({ userId: user.sub, roles: user.roles });
  }

  @Get('profiles/:id')
  @ApiOperation({ summary: 'Ver un perfil de proveedor y sus equivalencias.' })
  getProfile(@Param('id') id: string, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.getProviderProfile(id, { userId: user.sub, roles: user.roles });
  }

  @Post('profiles')
  @ApiOperation({ summary: 'Crear un perfil de proveedor (hoja, fila, separadores, moneda, tarifas y huella).' })
  createProfile(@Body() dto: ProviderProfileDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.createProviderProfile(dto, { userId: user.sub, roles: user.roles });
  }

  @Post('profiles/recognize')
  @ApiOperation({ summary: 'Reconocer el perfil de un proveedor y detectar cambios de encabezado.' })
  recognizeProfile(@Body() dto: RecognizeProfileDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.recognizeProviderProfile(dto, { userId: user.sub, roles: user.roles });
  }

  @Put('profiles/:id')
  @ApiOperation({ summary: 'Actualizar/revisar un perfil (un cambio de estructura sube su versión).' })
  updateProfile(@Param('id') id: string, @Body() dto: ProviderProfileDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.updateProviderProfile(id, dto, { userId: user.sub, roles: user.roles });
  }

  @Put('profiles/:id/equivalences')
  @ApiOperation({ summary: 'Reemplazar las equivalencias referencia externa → producto del perfil.' })
  setEquivalences(@Param('id') id: string, @Body() dto: ProviderEquivalenceListDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.setProviderEquivalences(id, dto.equivalences, { userId: user.sub, roles: user.roles });
  }

  @Post('profiles/:id/resolve')
  @ApiOperation({ summary: 'Resolver referencias externas del archivo (sin equivalencia única → pendiente).' })
  resolveReferences(@Param('id') id: string, @Body() dto: ResolveReferencesDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.resolveProviderReferences(id, dto.references, { userId: user.sub, roles: user.roles });
  }

  @Delete('profiles/:id')
  @ApiOperation({ summary: 'Retirar un perfil de proveedor (no borra precios ni productos).' })
  deleteProfile(@Param('id') id: string, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.deleteProviderProfile(id, { userId: user.sub, roles: user.roles });
  }
}
