import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
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
  @ValidateIf((o: ResolutionItemDto) => o.action === 'CREATE')
  @IsUUID()
  brandId?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o: ResolutionItemDto) => o.action === 'CREATE')
  @IsUUID()
  categoryId?: string;
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
 * Resolution of unknown SKUs of an applied price revision. Authentication only here
 * (no class-level @Roles, like customers and quotes): every decision is taken by the
 * service from the caller's current grants.
 */
@ApiTags('Prices - Referencias desconocidas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/prices/import/revisions')
export class PriceImportResolutionController {
  constructor(private readonly service: PriceImportResolutionService) {}

  @Get(':id/unknown-references')
  @ApiOperation({ summary: 'Referencias desconocidas pendientes de una revisión, con precios recibidos y si puedes crearlas.' })
  list(@Param('id') id: string, @Query() query: UnknownReferencesQueryDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.listUnknownReferences(id, { userId: user.sub, roles: user.roles }, Number(query.page) || 1, Number(query.pageSize) || 100);
  }

  @Post(':id/unknown-references/resolve')
  @ApiOperation({ summary: 'Crear borradores ocultos (CREATE) u omitir (SKIP) referencias desconocidas; resultado parcial por fila.' })
  resolve(@Param('id') id: string, @Body() dto: ResolveUnknownReferencesDto, @CurrentUser() user: { sub: string; roles: string[] }) {
    return this.service.resolve(id, dto.items as ResolutionItem[], { userId: user.sub, roles: user.roles });
  }
}
