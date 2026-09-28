import {
  IsString,
  IsEmail,
  IsEnum,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CustomerTypeEnum {
  INSTALLER = 'INSTALLER',
  DISTRIBUTOR = 'DISTRIBUTOR',
  END_COMPANY = 'END_COMPANY',
}

export class CreateAccessRequestDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MaxLength(120)
  companyName: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Colombian NIT: 5-12 digits, optionally with check digit',
  })
  @IsString()
  @Matches(/^[0-9]{5,12}(-[0-9])?$/, {
    message: 'NIT debe tener entre 5-12 dígitos, opcionalmente con dígito verificador',
  })
  nit: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MaxLength(80)
  contactName: string;

  @ApiProperty({ example: 'john@acme.com' })
  @IsEmail()
  @MaxLength(120)
  email: string;

  @ApiProperty({
    example: '+57 301 555 0123',
    description: 'Phone: 7-20 chars, alphanumeric, spaces, +, -, ()',
  })
  @IsString()
  @Matches(/^[0-9+ ()-]{7,20}$/, {
    message: 'Teléfono debe tener entre 7-20 caracteres (dígitos, espacios, +, -, ())',
  })
  @MaxLength(20)
  phone: string;

  @ApiProperty({
    enum: CustomerTypeEnum,
    example: 'INSTALLER',
  })
  @IsEnum(CustomerTypeEnum)
  customerType: CustomerTypeEnum;

  @ApiPropertyOptional({
    description: 'Honeypot field: if non-empty, treat as spam',
  })
  @IsString()
  @IsOptional()
  website?: string;
}
