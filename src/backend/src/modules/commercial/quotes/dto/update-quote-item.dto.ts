import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './absent.decorator';

/** Código de rechazo compartido por el ValidationPipe y el servicio. */
export const DISCOUNT_NOT_ALLOWED_IN_GENERAL_EDIT =
  'discount-not-allowed-in-general-edit: use PATCH /:id/items/:itemId/discount (quotes:discount)';

/**
 * Edición GENERAL de la línea (COM-03 §3): SOLO `quantity`. El descuento es
 * una operación sensible con acción propia (`quotes:discount`) y endpoint
 * dedicado `PATCH /:id/items/:itemId/discount`.
 *
 * El campo prohibido se declara SOLO para rechazo explícito: su presencia
 * invalida la petición ENTERA (400 `discount-not-allowed-in-general-edit`)
 * sin escritura parcial — ni la cantidad se aplica (patrón COM-02 §3; el
 * ValidationPipe global con whitelist + forbidNonWhitelisted devuelve el
 * mismo 400 antes de llegar al servicio).
 */
export class UpdateQuoteItemDto {
  @ApiPropertyOptional({ example: 10 })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Prohibido en la edición general (400 discount-not-allowed-in-general-edit). Use PATCH /:id/items/:itemId/discount.',
  })
  @IsAbsent({ message: DISCOUNT_NOT_ALLOWED_IN_GENERAL_EDIT })
  discountPct?: string;
}
