import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'usuario@gruposecurity.co' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Contraseña de la cuenta', format: 'password' })
  @IsString()
  @MinLength(8)
  password: string;
}
