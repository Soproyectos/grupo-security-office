import { IsString, MinLength, IsOptional, ValidateIf, IsBoolean, IsArray, ValidateNested, IsUUID, IsIn, IsISO8601, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceInputDto } from './price-input.dto';
import { SpecFieldDto, SpecsDto } from './spec-field.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'DS-2CD2143G2-I' })
  @IsString()
  @MinLength(2)
  sku: string;

  @ApiPropertyOptional({ example: 'Cámara IP Bullet 4MP', description: 'Optional: a draft without a name is saved with its reference as provisional name ("nombre pendiente"). Blank counts as missing.' })
  @ValidateIf((o) => typeof o.name === 'string' && o.name.trim() !== '')
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'Cámara de alta resolución para exterior' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'category-uuid-here', description: 'Optional: a draft with only sku + name is saved as "por clasificar". Never replaced by a placeholder category.' })
  @IsString()
  @IsOptional()
  categoryId?: string | null;

  @ApiPropertyOptional({ example: 'subcategory-uuid-here', description: 'Library subcategory. When sent, categoryId must match its derived category (CLASSIFICATION_CONFLICT otherwise).' })
  @IsString()
  @IsOptional()
  subcategoryId?: string | null;

  @ApiPropertyOptional({ example: 'brand-uuid-here', description: 'Optional: a draft without brand stays "por clasificar" and cannot be published.' })
  @IsString()
  @IsOptional()
  brandId?: string | null;

  @ApiPropertyOptional({ example: 'lista-uuid-here', description: 'Lista comercial a la que pertenece el producto. Si no se envía, se asigna LISTA-GENERAL (regla de fallback).' })
  @IsString()
  @IsUUID()
  @IsOptional()
  listaId?: string;

  @ApiPropertyOptional({ type: SpecsDto, description: 'Especificaciones técnicas tipadas (array de SpecFieldDto). Reemplaza a technicalSpecs legacy.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecsDto)
  specs?: SpecsDto;

  @ApiPropertyOptional({ type: SpecsDto, description: 'Atributos extra tipados (array de SpecFieldDto). Reemplaza a extraAttributes legacy.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecsDto)
  extraSpecs?: SpecsDto;

  @ApiPropertyOptional({
    type: [Object],
    example: [{ name: 'ficha-tecnica.pdf', url: '/uploads/doc-1.pdf', type: 'application/pdf', size: 204800 }],
    description: 'Documentos asociados al producto (name, url, type, size).',
  })
  @IsArray()
  @IsOptional()
  documents?: any[];

  @ApiPropertyOptional({
    type: [PriceInputDto],
    example: [{ priceListId: 'price-list-uuid', value: 1500000, currency: 'COP' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceInputDto)
  @IsOptional()
  prices?: PriceInputDto[];

  // Compatibilidad legacy: se aceptan technicalSpecs y extraAttributes como objetos planos
  // y se migran automáticamente a specs/extraSpecs en el servicio.
  @ApiPropertyOptional({ example: { resolution: '4MP', lens: '2.8mm' }, deprecated: true, description: 'Legacy: usar specs en su lugar.' })
  @IsObject()
  @IsOptional()
  technicalSpecs?: Record<string, any>;

  @ApiPropertyOptional({ example: { garantia: '1 año', origen: 'China' }, deprecated: true, description: 'Legacy: usar extraSpecs en su lugar.' })
  @IsObject()
  @IsOptional()
  extraAttributes?: Record<string, any>;

  // Campos legacy de compatibilidad. Un producto SIEMPRE se crea en estado
  // canónico DRAFT con isActive=false e isVisible=false (la FSM es la fuente de
  // verdad). Cualquier valor enviado aquí se ignora/normaliza en el servicio
  // para conservar el estado inicial definido; no generan estados legacy.
  @ApiPropertyOptional({ example: false, deprecated: true, description: 'Legacy: ignorado. La FSM fija isActive=false en DRAFT.' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false, deprecated: true, description: 'Legacy: ignorado. La FSM fija isVisible=false en DRAFT.' })
  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @ApiPropertyOptional({
    example: 'borrador',
    deprecated: true,
    description: 'Legacy: se acepta cualquiera de los cuatro valores históricos ("borrador", "listo", "publicado", "archivado") para compatibilidad de entrada, pero el servicio lo ignora/normaliza. El producto SIEMPRE se crea en estado canónico DRAFT (publishStatus="borrador"). La FSM es la única fuente de verdad del estado.',
  })
  @IsIn(['borrador', 'listo', 'publicado', 'archivado'])
  @IsOptional()
  publishStatus?: string;

  @ApiPropertyOptional({ example: '2026-09-01T08:00:00.000Z', deprecated: true, description: 'Legacy: ignorado al crear. La programación se gestiona vía PATCH /publish.' })
  @IsISO8601()
  @IsOptional()
  publishAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z', deprecated: true, description: 'Legacy: ignorado al crear. No existe auto-despublicación.' })
  @IsISO8601()
  @IsOptional()
  unpublishAt?: string;
}
