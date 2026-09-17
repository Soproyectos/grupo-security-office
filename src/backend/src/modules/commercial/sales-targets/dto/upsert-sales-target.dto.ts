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

  @ApiPropertyOptional({ description: 'Moneda ISO (default COP)', default: 'COP' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
