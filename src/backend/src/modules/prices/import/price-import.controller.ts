import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireGrant } from '../../../common/security/require-grant';
import { PriceImportService } from './price-import.service';
import { splitSinglePriceTariffs } from './price-template';
import { MAX_XLSX_BYTES } from './xlsx-container';

export class PriceTemplateQueryDto {
  @ApiProperty({ required: false, deprecated: true, description: 'Ignorado: la plantilla ya no depende de ninguna lista.' })
  @IsOptional()
  @IsUUID()
  listaId?: string;
  @IsIn(['vacias', 'referencias'])
  mode: string;
  @IsOptional()
  @IsString()
  tariffs?: string;
}

export class OfficialPriceTemplateQueryDto {
  @ApiProperty({ required: false, enum: ['true', 'false'], description: 'true descarga la plantilla de precio único (una sola columna PRECIO UNICO (CON IVA)) en lugar de la oficial por escalafón.' })
  @IsOptional()
  @IsIn(['true', 'false'])
  singlePrice?: string;
}

export class PriceImportExportQueryDto {
  @ApiProperty({ required: false, deprecated: true, description: 'Ignorado: la exportación ya no depende de ninguna lista.' })
  @IsOptional()
  @IsUUID()
  listaId?: string;
  @IsOptional()
  @IsString()
  tariffs?: string;
}

export class PriceImportPreviewDto {
  @ApiProperty({ required: false, deprecated: true, description: 'Ignorado desde 2026-10-20: el archivo se cruza por SKU y cada producto conserva su lista.' })
  @IsOptional()
  @IsUUID()
  listaId?: string;

  @ApiProperty({ required: false, description: 'Solo para archivos con la columna PRECIO UNICO (CON IVA): códigos de las tarifas que reciben ese precio, separados por comas (p. ej. TIENDA_IVA,CLIENTE_FINAL_IVA). Sin el campo: todas las tarifas disponibles. Se ignora si el archivo trae columnas de escalafón.' })
  @IsOptional()
  @IsString()
  singlePriceTariffs?: string;
}

export class PriceImportRevisionSaveDto {
  @ApiProperty({ required: false, deprecated: true, description: 'Ignorado desde 2026-10-20: la revisión puede mezclar listas; cada fila guarda la suya.' })
  @IsOptional()
  @IsUUID()
  listaId?: string;

  @ApiProperty({ description: 'Clave de idempotencia del cliente; repetirla no duplica la revisión.' })
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ required: false, description: 'Igual que en la vista previa: los mismos escalafones elegidos allí para el precio único. El servidor vuelve a expandir el archivo con esta selección.' })
  @IsOptional()
  @IsString()
  singlePriceTariffs?: string;
}

export class ApplyPriceImportRevisionDto {
  @ApiProperty({ required: false, description: 'Número de filas rechazadas que quedan sin aplicar. Obligatorio, e igual al número actual, si la revisión tiene filas rechazadas.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  acknowledgeRejectedRows?: number;

  @ApiProperty({ required: false, description: 'Confirma los cambios de precio grandes (mayores que el umbral). Obligatorio si la revisión los tiene.' })
  @IsOptional()
  @IsBoolean()
  confirmLargeChanges?: boolean;
}

export class PriceImportRevisionListQueryDto {
  @ApiProperty({ required: false, description: 'Filtro opcional heredado por lista; no concede ni exige acceso.' })
  @IsOptional()
  @IsUUID()
  listaId?: string;

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
// Solo concesiones del panel (globales): cada handler declara con @RequireGrant lo que exige (deniega por defecto)
// y el servicio las revalida POR SOLICITUD. El cargo nunca concede nada (Super Admin conserva su excepción).
@UseGuards(JwtAuthGuard)
@Controller('api/prices/import')
export class PriceImportController {
  constructor(private service: PriceImportService) {}

  @Get('template')
  // The needed grant depends on `mode` (vacias: prices:preview, referencias: prices:read): the service decides
  // it explicitly and denies by default.
  @ApiOperation({ summary: 'Descargar plantilla NUEVA (vacía: prices:preview; con las referencias del catálogo: prices:read; IMP-02).' })
  async downloadTemplate(
    @Query() dto: PriceTemplateQueryDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[] },
    @Res() res: Response,
  ) {
    const tariffs = dto.tariffs
      ? dto.tariffs.split(',').map((t) => t.trim()).filter((t) => t !== '')
      : undefined;
    const { buffer, fileName } = await this.service.downloadTemplate(
      dto.mode as 'vacias' | 'referencias',
      tariffs,
      { userId: user.sub, userName: user.name, roles: user.roles },
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // @Res() sin passthrough: Nest no aplica el TransformInterceptor al cuerpo.
    res.send(buffer);
  }

  @Get('template/official')
  @RequireGrant('prices:preview')
  @ApiOperation({ summary: 'Descargar la plantilla oficial vacía (hoja PLANTILLA, tarifas con IVA); no necesita lista. Con singlePrice=true, la plantilla de precio único.' })
  async downloadOfficialTemplate(
    @Query() dto: OfficialPriceTemplateQueryDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[] },
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.service.downloadOfficialTemplate(
      { userId: user.sub, userName: user.name, roles: user.roles },
      { singlePrice: dto?.singlePrice === 'true' },
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // @Res() sin passthrough: Nest no aplica el TransformInterceptor al cuerpo.
    res.send(buffer);
  }

  @Get('export')
  @RequireGrant('prices:read')
  @ApiOperation({ summary: 'Exportar referencias y precios vigentes del catálogo (IMP-07).' })
  async exportLista(
    @Query() dto: PriceImportExportQueryDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[] },
    @Res() res: Response,
  ) {
    const tariffs = dto.tariffs
      ? dto.tariffs.split(',').map((t) => t.trim()).filter((t) => t !== '')
      : undefined;
    const { buffer, fileName } = await this.service.exportPrices(tariffs, {
      userId: user.sub,
      userName: user.name,
      roles: user.roles,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    // @Res() sin passthrough: el TransformInterceptor no envuelve el Buffer.
    res.send(buffer);
  }

  @Post('preview')
  @RequireGrant('prices:preview', 'prices:read')
  @ApiOperation({ summary: 'Revisar precios con IVA sin crear productos ni modificar precios.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: {
    file: { type: 'string', format: 'binary' }, listaId: { type: 'string', format: 'uuid', deprecated: true },
    singlePriceTariffs: { type: 'string', description: 'Solo precio único: códigos de tarifa separados por comas (por defecto, todas las disponibles; la vista previa las lista en availableTariffs).' },
  } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 2, parts: 4 } }))
  preview(@UploadedFile() file: Express.Multer.File, @Body() dto: PriceImportPreviewDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[]; permissions: string[] }) {
    return this.service.preview(file, { userId: user.sub, userName: user.name, roles: user.roles }, {
      singlePriceTariffs: splitSinglePriceTariffs(dto?.singlePriceTariffs),
    });
  }

  @Post('revisions')
  @RequireGrant('prices:save', 'prices:preview', 'prices:read')
  @ApiOperation({ summary: 'Guardar una revisión de precios (imprescindible clave de idempotencia; NO aplica).' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'idempotencyKey'], properties: {
    file: { type: 'string', format: 'binary' }, listaId: { type: 'string', format: 'uuid', deprecated: true }, idempotencyKey: { type: 'string' },
    singlePriceTariffs: { type: 'string', description: 'Solo precio único: la misma selección de la vista previa (por defecto, todas las tarifas disponibles).' },
  } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XLSX_BYTES, files: 1, fields: 3, parts: 5 } }))
  saveRevision(@UploadedFile() file: Express.Multer.File, @Body() dto: PriceImportRevisionSaveDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.saveRevision(file, dto.idempotencyKey, { userId: user.sub, userName: user.name, roles: user.roles }, {
      singlePriceTariffs: splitSinglePriceTariffs(dto.singlePriceTariffs),
    });
  }

  @Get('revisions')
  @RequireGrant('prices:read')
  @ApiOperation({ summary: 'Listar las revisiones de precios (paginado).' })
  listRevisions(@Query() dto: PriceImportRevisionListQueryDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.listRevisions(dto.listaId, Number(dto.page), Number(dto.pageSize), { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Get('revisions/:id')
  @RequireGrant('prices:read')
  @ApiOperation({ summary: 'Ver una revisión (filas y precios guardados; paginado).' })
  getRevision(@Param('id') id: string, @Query() dto: PriceImportRevisionPageQueryDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.getRevision(id, Number(dto.page), Number(dto.pageSize), { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Get('revisions/:id/file')
  @RequireGrant('prices:read')
  @ApiOperation({ summary: 'Descargar el archivo original de una revisión autorizada.' })
  async getRevisionFile(@Param('id') id: string, @CurrentUser() user: { sub: string; name?: string; roles: string[] },
    @Res() res: Response) {
    const { buffer, fileName } = await this.service.getRevisionFile(id, { userId: user.sub, userName: user.name, roles: user.roles });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    // @Res() sin passthrough: el TransformInterceptor no envuelve el Buffer.
    res.send(buffer);
  }

  @Post('revisions/:id/apply')
  @RequireGrant('prices:apply', 'prices:read')
  @ApiOperation({ summary: 'Aplicar las filas válidas de una revisión (prices:apply global; transacción atómica). 409 con code REJECTED_ROWS_UNACKNOWLEDGED, LARGE_CHANGES_UNCONFIRMED, NOTHING_TO_APPLY o REVISION_CONFLICT (LISTA_ACCESS_CHANGED, PRICE_CHANGED...).' })
  applyRevision(@Param('id') id: string, @Body() dto: ApplyPriceImportRevisionDto,
    @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.applyRevision(id, { userId: user.sub, userName: user.name, roles: user.roles }, {
      acknowledgeRejectedRows: dto?.acknowledgeRejectedRows, confirmLargeChanges: dto?.confirmLargeChanges,
    });
  }

  @Delete('revisions/:id')
  @RequireGrant('prices:save', 'prices:read')
  @ApiOperation({ summary: 'Descartar una revisión pendiente (no aplica ni borra precios).' })
  discardRevision(@Param('id') id: string, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.discardRevision(id, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  // ─── IMP-07B (07B) — perfiles de proveedor (acciones providers:read/write) ───

  @Get('profiles')
  @RequireGrant('providers:read')
  @ApiOperation({ summary: 'Listar los perfiles de proveedor guardados.' })
  listProfiles(@CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.listProviderProfiles({ userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Get('profiles/:id')
  @RequireGrant('providers:read')
  @ApiOperation({ summary: 'Ver un perfil de proveedor y sus equivalencias.' })
  getProfile(@Param('id') id: string, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.getProviderProfile(id, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Post('profiles')
  @RequireGrant('providers:write', 'providers:read')
  @ApiOperation({ summary: 'Crear un perfil de proveedor (hoja, fila, separadores, moneda, tarifas y huella).' })
  createProfile(@Body() dto: ProviderProfileDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.createProviderProfile(dto, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Post('profiles/recognize')
  @RequireGrant('providers:read')
  @ApiOperation({ summary: 'Reconocer el perfil de un proveedor y detectar cambios de encabezado.' })
  recognizeProfile(@Body() dto: RecognizeProfileDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.recognizeProviderProfile(dto, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Put('profiles/:id')
  @RequireGrant('providers:write', 'providers:read')
  @ApiOperation({ summary: 'Actualizar/revisar un perfil (un cambio de estructura sube su versión).' })
  updateProfile(@Param('id') id: string, @Body() dto: ProviderProfileDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.updateProviderProfile(id, dto, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Put('profiles/:id/equivalences')
  @RequireGrant('providers:write', 'providers:read')
  @ApiOperation({ summary: 'Reemplazar las equivalencias referencia externa → producto del perfil.' })
  setEquivalences(@Param('id') id: string, @Body() dto: ProviderEquivalenceListDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.setProviderEquivalences(id, dto.equivalences, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Post('profiles/:id/resolve')
  @RequireGrant('providers:read')
  @ApiOperation({ summary: 'Resolver referencias externas del archivo (sin equivalencia única → pendiente).' })
  resolveReferences(@Param('id') id: string, @Body() dto: ResolveReferencesDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.resolveProviderReferences(id, dto.references, { userId: user.sub, userName: user.name, roles: user.roles });
  }

  @Delete('profiles/:id')
  @RequireGrant('providers:write', 'providers:read')
  @ApiOperation({ summary: 'Retirar un perfil de proveedor (no borra precios ni productos).' })
  deleteProfile(@Param('id') id: string, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.deleteProviderProfile(id, { userId: user.sub, userName: user.name, roles: user.roles });
  }
}
