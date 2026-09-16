import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class SalesTargetQueryDto {
  @ApiPropertyOptional({
    description: 'Usuario dueño de las metas (YYYY-MM range). Si se omite: propios del usuario autenticado; admins ven todos.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ description: 'Periodo inicial inclusive (YYYY-MM)' })
  @IsOptional()
  @Matches(PERIOD_PATTERN, { message: 'from debe tener formato YYYY-MM' })
  from?: string;

  @ApiPropertyOptional({ description: 'Periodo final inclusive (YYYY-MM)' })
  @IsOptional()
  @Matches(PERIOD_PATTERN, { message: 'to debe tener formato YYYY-MM' })
  to?: string;
}
