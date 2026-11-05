import { IsString, MinLength, IsOptional, IsArray, ValidateNested, IsUUID, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PriceInputDto } from './price-input.dto';
import { SpecFieldDto, SpecsDto } from './spec-field.dto';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'DS-2CD2143G2-I-v2' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'Cámara IP Bullet 4MP Pro' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Library subcategory. When sent, categoryId must match its derived category (CLASSIFICATION_CONFLICT otherwise).' })
  @IsString()
  @IsOptional()
  subcategoryId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandId?: string | null;

  @ApiPropertyOptional({ example: 'lista-uuid-here', description: 'Lista comercial a la que se reasigna el producto.' })
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

  @ApiPropertyOptional({ type: [PriceInputDto] })
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
}
