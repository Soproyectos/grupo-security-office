import {
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsEnum,
  MaxLength,
  IsISO8601,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const LISTA_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

export class CreateListaDto {
  @ApiProperty({ example: 'LISTA-HIKV-VID' })
  @IsString()
  @MinLength(2)
  code: string;

  @ApiPropertyOptional({
    example: 'HIKV-2026',
    description: 'Código de identificación de la lista (único si viene, nullable)',
  })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  codigo?: string;

  @ApiProperty({ example: 'Lista Hikvision Video' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Lista comercial para línea de video Hikvision' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: LISTA_CURRENCIES, default: 'COP' })
  @IsEnum(LISTA_CURRENCIES)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: true, description: 'Estado activo de la Lista' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'COMERCIAL',
    description: 'Tipo de Lista (p.ej. COMERCIAL, PROMOCIONAL, ESPECIAL)',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Visibilidad por defecto para nuevos productos de la Lista',
  })
  @IsBoolean()
  @IsOptional()
  defaultVisibility?: boolean;

  @ApiPropertyOptional({
    example: 'b1a2c3d4-...',
    description: 'Usuario responsable de la Lista (UUID)',
  })
  @IsUUID()
  @IsOptional()
  responsibleId?: string;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00Z',
    description: 'Inicio de vigencia (ISO 8601)',
  })
  @IsISO8601()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59Z',
    description: 'Fin de vigencia (ISO 8601)',
  })
  @IsISO8601()
  @IsOptional()
  validUntil?: string;
}
