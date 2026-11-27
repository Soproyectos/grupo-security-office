import { IsEmail, IsString, MinLength, IsBoolean, IsOptional, IsArray, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@grupo-security.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'SecurePass123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: ['role-id-1', 'role-id-2'] })
  @IsArray()
  @IsOptional()
  roleIds?: string[];

  /** Advisor zone (used to auto-assign web registrations by city). Create/update are Super Admin only. */
  @ApiPropertyOptional({ example: 'zone-id-1', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'La zona elegida no es válida' })
  @IsOptional()
  zoneId?: string | null;
}
