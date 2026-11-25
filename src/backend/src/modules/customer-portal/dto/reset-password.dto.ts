import { IsString, Length, Matches } from 'class-validator';
import { ForgotPasswordRequestDto } from './forgot-password-request.dto';

export class ResetPasswordDto extends ForgotPasswordRequestDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;

  @IsString()
  @Length(12, 128)
  password!: string;
}
