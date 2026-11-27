import { IsEmail, IsString, MinLength, IsBoolean, IsOptional, IsArray, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'nuevo@email.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'NewPass123' })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: ['role-id-1'] })
  @IsArray()
  @IsOptional()
  roleIds?: string[];

  // @IsOptional() de class-validator solo salta la validacion cuando el valor
  // es undefined, NO cuando es null explicito — y null es un valor valido acá
  // (significa "quitar supervisor"). @ValidateIf evita que @IsUUID() rechace
  // ese null con un 400.
  @ApiPropertyOptional({ example: 'supervisor-id-1', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  @IsOptional()
  supervisorId?: string | null;

  /** Advisor zone; `null` clears it. Only Super Admin reaches this endpoint. */
  @ApiPropertyOptional({ example: 'zone-id-1', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'La zona elegida no es válida' })
  @IsOptional()
  zoneId?: string | null;
}
