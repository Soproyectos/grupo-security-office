import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateSubcategoryDto {
  @ApiProperty({ description: 'Categoría principal (raíz) de la que cuelga.' })
  @IsString()
  categoryId: string;

  @ApiProperty({ example: 'Cámaras IP' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Si se omite se deriva del nombre.' })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'El slug solo admite minúsculas, números y guiones.' })
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  searchTerms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubcategoryDto {
  @ApiPropertyOptional({ description: 'Renombrar conserva el id y todas sus relaciones.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'El slug solo admite minúsculas, números y guiones.' })
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional({ description: 'Mover a otra categoría principal. Con productos o moldes exige confirmImpact.' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  searchTerms?: string[];

  @ApiPropertyOptional({ description: 'Confirma el impacto de cambiar la categoría padre.' })
  @IsOptional()
  @IsBoolean()
  confirmImpact?: boolean;
}

export class ListSubcategoriesQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nombre, slug o términos de búsqueda (sin distinguir mayúsculas).' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
