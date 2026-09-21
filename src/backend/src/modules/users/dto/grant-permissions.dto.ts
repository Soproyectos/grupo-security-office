import { IsArray, IsString, IsOptional, MaxLength, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrantPermissionsDto {
  @ApiProperty({
    description:
      'Conjunto COMPLETO de permisos concedidos. Lo que no venga aquí se retira.',
    example: ['dashboard:pack:ventas', 'dashboard:block:ranking-equipo'],
  })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions: string[];

  @ApiPropertyOptional({ description: 'Motivo, para la auditoría' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
