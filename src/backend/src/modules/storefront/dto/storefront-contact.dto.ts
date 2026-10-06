import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * E.164 sin `+` ni espacios (p.ej. `576011234567`): es la única forma en que se
 * guardan los teléfonos, porque los `href` (`tel:`, `https://wa.me/…`) se
 * derivan en el cliente y no se duplican.
 */
export const E164_PATTERN = /^\d{7,15}$/;

export class UpdateStorefrontContactDto {
  @ApiProperty({ example: '576011234567', description: 'Línea nacional en E.164 sin + ni espacios' })
  @IsString()
  @Matches(E164_PATTERN, { message: 'El teléfono debe estar en E.164 sin + ni espacios (7 a 15 dígitos)' })
  nationalPhone: string;

  @ApiPropertyOptional({
    example: '576011234567',
    description: 'WhatsApp en E.164; si se envía vacío se deriva de nationalPhone',
  })
  @IsOptional()
  @IsString()
  @Matches(E164_PATTERN, { message: 'El teléfono debe estar en E.164 sin + ni espacios (7 a 15 dígitos)' })
  whatsappPhone?: string;

  @ApiPropertyOptional({ example: '5761234567', description: 'Línea de ventas en E.164' })
  @IsOptional()
  @IsString()
  @Matches(E164_PATTERN, { message: 'El teléfono debe estar en E.164 sin + ni espacios (7 a 15 dígitos)' })
  salesPhone?: string;

  @ApiProperty({ example: 'serviciocliente@gruposecurity.example' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(180)
  email: string;

  @ApiProperty({ example: 'lun a sáb 7:00 a. m. a 7:00 p. m.', description: 'Horario corto de la barra superior' })
  @IsString()
  @MaxLength(120)
  businessHoursShort: string;

  @ApiProperty({
    example: 'lunes a sábado de 7:00 a.m. a 7:00 p.m. · domingos y festivos de 8:00 a.m. a 2:00 p.m.',
    description: 'Horario largo del footer',
  })
  @IsString()
  @MaxLength(255)
  businessHoursFull: string;

  @ApiProperty({
    example: 'Hola, quiero información para vender mis productos con Grupo Security.',
    description: 'Mensaje prellenado del botón "Vende con nosotros"',
  })
  @IsString()
  @MaxLength(300)
  sellWithUsMessage: string;
}