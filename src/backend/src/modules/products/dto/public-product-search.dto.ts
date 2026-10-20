import { IsInt, IsOptional, IsString, MaxLength, MinLength, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PublicProductSearchDto {
  @ApiPropertyOptional({ type: String, description: 'Término de búsqueda (nombre o SKU)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Slug de la categoría; incluye los productos de sus subcategorías',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ type: Number, description: 'Productos a omitir (default 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  offset?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Cantidad máxima de resultados (default 24, tope 48)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}
