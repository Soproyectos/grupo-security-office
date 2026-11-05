import { IsString, IsBoolean, IsOptional, IsEnum, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductImageType } from '@prisma/client';

export class UpdateProductImageDto {
  @ApiPropertyOptional({ example: 'Cámara IP 4MP vista frontal' })
  @IsString()
  @IsOptional()
  alt?: string;

  @ApiPropertyOptional({ example: true, description: 'Marca esta imagen como principal (desmarca las demás del mismo producto).' })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ enum: ProductImageType, example: ProductImageType.COMPLEMENTARIA })
  @IsEnum(ProductImageType)
  @ValidateIf((_object, value) => value !== undefined)
  type?: ProductImageType;
}
