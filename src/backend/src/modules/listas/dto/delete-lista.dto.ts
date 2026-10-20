import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body del DELETE físico de una Lista.
 *
 * CAT-01 §3: el borrado solo elimina la FILA de la Lista. Los productos, sus
 * imágenes (filas y bytes) y sus precios sobreviven con IDs intactos y
 * `Product.listaId` queda `null` (FK SET NULL); los accesos de la Lista se
 * retiran. `confirm` sigue el mismo patrón que `DeleteProductDto`: sin ella,
 * 400 y ninguna escritura. Una Lista con cotizaciones se rechaza con 409
 * (FK RESTRICT de `Quote.listaId`).
 */
export class DeleteListaDto {
  @ApiPropertyOptional({
    description: 'Confirmación explícita del borrado físico. Obligatoria (true).',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  confirm?: boolean;
}
