import { Transform } from 'class-transformer';
import { PortalAccountType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class RegisterPortalAccountDto {
  @IsEmail()
  @Transform(({value})=>typeof value==='string'?value.trim():value)
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Length(2, 120)
  @Transform(({value})=>typeof value==='string'?value.trim():value)
  contactName!: string;

  @IsString()
  @Length(2, 160)
  @Transform(({value})=>typeof value==='string'?value.trim():value)
  companyName!: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  @Transform(({value})=>typeof value==='string'?value.trim():value)
  documentId?: string;

  @IsOptional()
  @IsString()
  @Length(7, 30)
  @Transform(({value})=>typeof value==='string'?value.trim():value)
  phone?: string;

  @IsOptional()
  @IsEnum(PortalAccountType)
  type?: PortalAccountType;
}
