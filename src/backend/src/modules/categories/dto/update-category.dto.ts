import { IsString, MinLength, IsOptional, IsBoolean, IsNumber, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'CCTV Profesional' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Cámaras IP y accesorios' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'cctv-profesional' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/images\/[\w\-/]+\.(svg|png|jpe?g|webp)|https:\/\/.+)$/)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/images\/[\w\-/]+\.(svg|png|jpe?g|webp)|https:\/\/.+)$/)
  iconUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
