import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsDateString,
  IsString,
  MaxLength,
  IsISO8601,
  IsUUID,
} from 'class-validator';
import { CreateListaDto } from './create-lista.dto';

export class UpdateListaDto extends PartialType(CreateListaDto) {
  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59Z',
    description: 'Marcar Lista como archivada lógicamente (solo manage)',
  })
  @IsDateString()
  @IsOptional()
  archivedAt?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Forzar isActive (usado en toggleActive)',
  })
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
    description: 'Usuario responsable de la Lista (UUID). null para limpiar.',
  })
  @IsUUID()
  @IsOptional()
  responsibleId?: string;

  @ApiPropertyOptional({
    example: 'HIKV-2026',
    description: 'Código de identificación de la lista (único si viene). null para limpiar.',
  })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  codigo?: string;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00Z',
    description: 'Inicio de vigencia (ISO 8601). null para limpiar.',
  })
  @IsISO8601()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59Z',
    description: 'Fin de vigencia (ISO 8601). null para limpiar.',
  })
  @IsISO8601()
  @IsOptional()
  validUntil?: string;
}
