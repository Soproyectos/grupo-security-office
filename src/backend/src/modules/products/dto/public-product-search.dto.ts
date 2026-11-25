import { IsArray, ArrayMaxSize, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, Matches, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PublicProductSearchDto {
  @ApiPropertyOptional({ type: String, description: 'Término de búsqueda (nombre o SKU)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ type: [String], description: 'Referencias exactas del catálogo publicado, hasta 12' })
  @IsOptional()
  @Transform(({ value }) => value === undefined || Array.isArray(value) ? value : [value])
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  sku?: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'Slug de la categoría; incluye los productos de sus subcategorías',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Slug de subcategoría activa bajo Cámaras, o hasta 3 slugs separados por coma (a,b,c)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  @Matches(/^[a-z0-9-]+(,[a-z0-9-]+){0,2}$/, {
    message: 'subcategory debe ser un slug o hasta 3 slugs separados por coma (máximo 3)',
  })
  subcategory?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Filtro por dato clave publicado, `<dato>:<valor>`; repetible, todos deben cumplirse',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keySpec?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Requisito publicado, clave:valor, todos deben cumplirse' })
  @IsOptional()
  @Transform(({ value }) => value === undefined ? undefined : Array.isArray(value) ? value : [value])
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(600, { each: true })
  @Matches(/^[a-z0-9_]{1,99}:.{1,500}$/u, { each: true, message: 'El requisito debe tener la forma clave:valor' })
  requirement?: string[];

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

  @ApiPropertyOptional({
    type: String,
    description: 'Slug de la marca; filtra por marca de la revisión publicada o columna viva',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({
    enum: ['recent'],
    description: 'Orden: `recent` = publicados más recientes primero; se ignora si hay texto de búsqueda `q`',
  })
  @IsOptional()
  @IsIn(['recent'])
  sort?: 'recent';
}
