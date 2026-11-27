import { IsString, IsOptional, IsIn, IsEmail, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CUSTOMER_STATUSES = ['LEAD', 'CLIENTE', 'INACTIVO'] as const;
export const CUSTOMER_SOURCES = [
  'REFERIDO',
  'PROMOCION',
  'LLAMADA_FRIA',
  'WEB',
  'EVENTO',
  'OTRO',
] as const;

export class CreateCustomerDto {
  @ApiProperty({ example: 'Seguridad Andina S.A.S.' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'NIT' })
  @IsString()
  @IsOptional()
  documentType?: string;

  @ApiPropertyOptional({
    example: '901123456-1',
    description:
      'Para NIT, el dígito de verificación es opcional; si se escribe (con guion) debe coincidir con el calculado o responde 400 INVALID_NIT_DV. Se guarda solo el número base.',
  })
  @IsString()
  @IsOptional()
  documentId?: string;

  @ApiPropertyOptional({ example: 'contacto@empresa.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsString()
  @IsOptional()
  phone?: string;

  /** DIVIPOLA municipality code (5 digits, same list and format as the web accounts); the service checks it. */
  @ApiPropertyOptional({ example: '11001' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Cra 7 # 123-45' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'LEAD', enum: CUSTOMER_STATUSES })
  @IsIn(CUSTOMER_STATUSES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'REFERIDO', enum: CUSTOMER_SOURCES })
  @IsIn(CUSTOMER_SOURCES)
  @IsOptional()
  source?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceDetail?: string;

  /**
   * Dueño comercial del cliente. Si no se envía, el servicio asigna
   * `ownerId = ctx.userId` (el creador es el dueño por defecto).
   */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
