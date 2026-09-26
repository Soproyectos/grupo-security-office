import { IsOptional, IsNumber, IsString, MaxLength, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PublicProductSearchDto {
  @ApiPropertyOptional({ type: String, description: 'Término de búsqueda (nombre o SKU)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Cantidad máxima de resultados (default 24, tope 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
