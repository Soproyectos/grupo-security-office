import { PortalAccountType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterPortalAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Length(2, 120)
  contactName!: string;

  @IsString()
  @Length(2, 160)
  companyName!: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  documentId?: string;

  @IsOptional()
  @IsString()
  @Length(7, 30)
  phone?: string;

  @IsEnum(PortalAccountType)
  type!: PortalAccountType;
}
