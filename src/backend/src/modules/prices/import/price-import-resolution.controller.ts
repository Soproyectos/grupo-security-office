import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireGrant } from '../../../common/security/require-grant';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { MAX_RESOLUTION_ITEMS, PriceImportResolutionService, type ResolutionItem } from './price-import-resolution.service';

export class ResolutionItemDto {
  @ApiProperty({ description: 'Número de fila de la revisión.' })
  @IsInt()
  @Min(1)
  rowNumber: number;

  @ApiProperty({ enum: ['CREATE', 'SKIP'] })
  @IsIn(['CREATE', 'SKIP'])
  action: 'CREATE' | 'SKIP';

  @ApiProperty({ required: false, description: 'Nombre del producto (CREATE), 1 a 255 caracteres.' })
  @ValidateIf((o: ResolutionItemDto) => o.action === 'CREATE')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o: ResolutionItemDto) => o.action === 'CREATE' && o.brandId !== undefined && o.brandId !== null)
  @IsUUID()
  brandId?: string | null;

  @ApiProperty({ required: false })
  @ValidateIf((o: ResolutionItemDto) => o.action === 'CREATE' && o.categoryId !== undefined && o.categoryId !== null)
  @IsUUID()
  categoryId?: string | null;
}

export class ResolveUnknownReferencesDto {
  @ApiProperty({ type: [ResolutionItemDto], description: `Máximo ${MAX_RESOLUTION_ITEMS} filas por solicitud.` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RESOLUTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ResolutionItemDto)
  items: ResolutionItemDto[];
}

export class UnknownReferencesQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

/**
 * Resolution of unknown SKUs of an applied price revision. Every handler needs the global `prices:read` panel
 * grant (deny by default); creating drafts additionally needs `products:write` + `prices:apply`, decided by the
 * service from the caller's current grants. No role and no lista grants anything.
 */
@ApiTags('Prices - Referencias desconocidas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/prices/import/revisions')
export class PriceImportResolutionController {
  constructor(private readonly service: PriceImportResolutionService) {}

  @Get(':id/unknown-references')
  @RequireGrant('prices:read')
  @ApiOperation({ summary: 'Referencias desconocidas pendientes de una revisión, con precios recibidos y si puedes crearlas.' })
  list(@Param('id') id: string, @Query() query: UnknownReferencesQueryDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.listUnknownReferences(id, { userId: user.sub, userName: user.name, roles: user.roles }, Number(query.page) || 1, Number(query.pageSize) || 100);
  }

  @Post(':id/unknown-references/resolve')
  @RequireGrant('prices:read')
  @ApiOperation({ summary: 'Crear borradores ocultos (CREATE) u omitir (SKIP) referencias desconocidas; resultado parcial por fila.' })
  resolve(@Param('id') id: string, @Body() dto: ResolveUnknownReferencesDto, @CurrentUser() user: { sub: string; name?: string; roles: string[] }) {
    return this.service.resolve(id, dto.items as ResolutionItem[], { userId: user.sub, userName: user.name, roles: user.roles });
  }
}
