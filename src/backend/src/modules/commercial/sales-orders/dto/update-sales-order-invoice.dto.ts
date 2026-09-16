import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Registro manual de la factura externa (Yéminus). La fecha llega como string
 * ISO 8601 por JSON (mismo patrón que UpdateCustomerDto.lastContactAt) y se
 * convierte a Date en el service.
 */
export class UpdateSalesOrderInvoiceDto {
  @ApiPropertyOptional({ description: 'Número de factura externa en Yéminus' })
  @IsString()
  @IsOptional()
  externalInvoiceNumber?: string;

  @ApiPropertyOptional({ description: 'Fecha de la factura externa (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  externalInvoiceDate?: string;
}
