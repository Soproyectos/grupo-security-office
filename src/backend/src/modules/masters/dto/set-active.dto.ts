import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Explicit, idempotent activation state of a master-catalog record. */
export class SetActiveDto {
  @ApiProperty({ description: 'true activa, false desactiva. Nunca elimina productos, precios ni historial.' })
  @IsBoolean()
  isActive: boolean;
}
