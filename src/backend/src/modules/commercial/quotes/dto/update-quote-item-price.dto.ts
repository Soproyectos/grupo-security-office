import { IsNumber, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Sets the price of a quote line (completes a "precio por confirmar" line). Needs `quotes:edit`. */
export class UpdateQuoteItemPriceDto {
  @ApiProperty({ example: 125000, description: 'Precio unitario (COP), mayor que cero y con máximo 2 decimales' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: 'El precio debe ser un número con máximo 2 decimales' })
  @Min(0.01, { message: 'El precio debe ser mayor que cero' })
  @Max(9_999_999_999, { message: 'El precio es demasiado alto' })
  unitPrice: number;
}
