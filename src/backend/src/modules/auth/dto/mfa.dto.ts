import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Un código TOTP tiene 6 dígitos; uno de respaldo, 10 caracteres hexadecimales.
 * Se acepta el rango completo y el servicio distingue cuál es.
 */
export class MfaCodeDto {
  @ApiProperty({ example: '123456', description: 'Código TOTP o de respaldo' })
  @IsString()
  @Length(6, 10)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'El código sólo puede contener letras y números.',
  })
  code: string;
}

export class MfaVerifyDto extends MfaCodeDto {
  @ApiProperty({ description: 'Token de desafío devuelto por /login' })
  @IsString()
  challengeToken: string;
}

export class MfaEnrollConfirmDto extends MfaCodeDto {
  @ApiProperty({ description: 'Token de desafío de enrolamiento' })
  @IsString()
  challengeToken: string;
}
