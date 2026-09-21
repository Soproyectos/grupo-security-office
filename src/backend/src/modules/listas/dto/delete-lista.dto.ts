import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body del DELETE físico de una Lista.
 *
 * `removeLista` borra en cascada los productos huérfanos que quedarían tras
 * borrar la Lista (con sus precios, imágenes e inventario) — es destructivo e
 * irreversible, igual que el borrado físico de un producto. `confirm` sigue
 * el mismo patrón que `DeleteProductDto`: sin ella, 400 y ninguna escritura.
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
