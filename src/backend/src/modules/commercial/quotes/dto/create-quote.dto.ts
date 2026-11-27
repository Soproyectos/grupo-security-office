import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsDecimal,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuoteDto {
  @ApiProperty({ example: '9f1b2a4e-...' })
  @IsUUID()
  customerId: string;

  /** Deprecated: quotes no longer use Listas. Accepted for old clients and ignored. */
  @ApiPropertyOptional({ deprecated: true, description: 'Ignorado: las cotizaciones ya no usan Listas' })
  @IsUUID()
  @IsOptional()
  listaId?: string;

  @ApiPropertyOptional({ example: 'b2a1c0d4-...' })
  @IsUUID()
  @IsOptional()
  priceListId?: string;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional({ example: '19.00', description: 'Porcentaje de impuesto (IVA)' })
  @IsDecimal()
  @IsOptional()
  taxRate?: string;

  @ApiPropertyOptional({ example: 'Cliente pidió entrega en 15 días' })
  @IsString()
  @IsOptional()
  notes?: string;
}
