import { IsString, MinLength, IsOptional, IsBoolean, IsNumber, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'CCTV' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'Cámaras de vigilancia y accesorios' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'cctv' })
  @IsString()
  @MinLength(2)
  slug: string;

  @ApiPropertyOptional({ example: 'parent-category-id' })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ example: 0 })
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
