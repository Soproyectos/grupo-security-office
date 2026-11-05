import { IsOptional, IsNumber, IsString, IsBoolean, Min, Matches } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProductQueryDto {
  @ApiPropertyOptional({ type: Number, description: 'Número de registros a omitir' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ type: Number, description: 'Número de registros a devolver' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number;

  @ApiPropertyOptional({ type: Number, description: 'Alias de take (paginación limit/offset); take tiene precedencia si se envían ambos' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ type: String, description: 'Término de búsqueda' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: String, description: 'ID de categoría para filtrar' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: String, description: 'IDs de categorías separadas por coma; cada categoría incluye sus descendientes' })
  @IsOptional()
  @IsString()
  @Matches(/^[^,\s]+(?:,[^,\s]+)*$/)
  categoryIds?: string;

  @ApiPropertyOptional({ type: String, description: 'ID de marca para filtrar' })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Filtrar por visibilidad' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  })
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Filtrar por estado activo' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Incluir solo productos de una Lista Activa (no Inactiva/Archivada)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  })
  @IsBoolean()
  activeListaOnly?: boolean;
}
