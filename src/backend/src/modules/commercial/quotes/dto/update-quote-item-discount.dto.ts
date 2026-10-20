import { IsDecimal } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Operación SENSIBLE de descuento por línea (COM-03 §3): separada de la
 * edición de cantidades. Exige la acción `quotes:discount` en el servicio y
 * valida rango 0–100 ANTES de escribir (400). No toca `quantity`.
 */
export class UpdateQuoteItemDiscountDto {
  @ApiProperty({ example: '10.00', description: 'Descuento porcentual sobre la línea (0-100)' })
  @IsDecimal()
  discountPct: string;
}
