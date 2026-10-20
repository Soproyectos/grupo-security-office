import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsNumberString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertSalesTargetDto {
  @ApiProperty({ description: 'Usuario dueño de la meta' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Periodo de la meta (YYYY-MM); se persiste como día 1 del mes',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period debe tener formato YYYY-MM',
  })
  period: string;

  @ApiProperty({ description: 'Monto de la meta (string decimal, >= 0)', example: '150000000' })
  @IsNumberString(
    { no_symbols: false },
    { message: 'amount debe ser un número decimal como string' },
  )
  amount: string;

  @ApiProperty({
    description:
      'Moneda ISO 4217 de 3 letras, EXPLÍCITA (COM-04 regla 3 / G3: sin default; el servicio valida COP/USD/EUR)',
    example: 'COP',
  })
  @IsString()
  @IsNotEmpty({ message: 'currency es obligatoria (moneda explícita)' })
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'currency debe ser ISO 4217 de 3 letras',
  })
  currency: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
