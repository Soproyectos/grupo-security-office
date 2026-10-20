import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './absent.decorator';

/** Código de rechazo compartido por el ValidationPipe y el servicio. */
export const DISCOUNT_NOT_ALLOWED_IN_ADD =
  'discount-not-allowed-in-add: use PATCH /:id/items/:itemId/discount (quotes:discount)';

export class AddQuoteItemDto {
  @ApiProperty({ example: '4d2f8a1c-...' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 5, default: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Prohibido en el alta (400 discount-not-allowed-in-add). Aplique el descuento con PATCH /:id/items/:itemId/discount (quotes:discount).',
  })
  @IsAbsent({ message: DISCOUNT_NOT_ALLOWED_IN_ADD })
  discountPct?: string;
}
