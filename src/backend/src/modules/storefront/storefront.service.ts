import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateStorefrontContactDto } from './dto/storefront-contact.dto';
import { DEMO_STOREFRONT_CONTACT } from './storefront-contact.demo';

/** Datos de contacto que el storefront necesita mostrar (respuesta pública). */
export interface PublicStorefrontContact {
  nationalPhone: string;
  whatsappPhone: string;
  salesPhone: string | null;
  email: string;
  businessHoursShort: string;
  businessHoursFull: string;
  sellWithUsMessage: string;
}

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Fila única del singleton. `findFirst` (no `findUnique`) porque la tabla no
   * tiene clave única de negocio: la unicidad la garantiza el seed.
   */
  private async findRow() {
    return this.prisma.storefrontContact.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  async getContact() {
    const row = await this.findRow();
    if (!row) {
      throw new NotFoundException('No hay datos de contacto de la tienda configurados');
    }
    return row;
  }

  /**
   * Lectura pública del storefront. Si la tabla está vacía devuelve los valores
   * demo en vez de fallar: un dato de contacto ausente no puede dejar la tienda
   * en blanco (y el frontend también cae a sus constantes si el API falla).
   */
  async getPublicContact(): Promise<PublicStorefrontContact> {
    const row = await this.findRow();
    const source = row ?? DEMO_STOREFRONT_CONTACT;

    return {
      nationalPhone: source.nationalPhone,
      whatsappPhone: source.whatsappPhone || source.nationalPhone,
      salesPhone: source.salesPhone ?? null,
      email: source.email,
      businessHoursShort: source.businessHoursShort,
      businessHoursFull: source.businessHoursFull,
      sellWithUsMessage: source.sellWithUsMessage,
    };
  }

  async updateContact(dto: UpdateStorefrontContactDto, actorId?: string) {
    const current = await this.findRow();
    const data = {
      nationalPhone: dto.nationalPhone,
      // Un WhatsApp vacío hereda la línea nacional: es el caso por defecto de
      // la tienda y evita tener que rellenar el mismo número dos veces.
      whatsappPhone: dto.whatsappPhone || dto.nationalPhone,
      salesPhone: dto.salesPhone ?? null,
      email: dto.email,
      businessHoursShort: dto.businessHoursShort,
      businessHoursFull: dto.businessHoursFull,
      sellWithUsMessage: dto.sellWithUsMessage,
      updatedById: actorId ?? null,
    };

    // Si la tabla está vacía (migración aplicada sin seed) la fila se crea con el
    // guardado: el panel es la única vía para dejar estos datos correctos y no
    // debe exigir tocar código para establecerlos.
    const updated = current
      ? await this.prisma.storefrontContact.update({ where: { id: current.id }, data })
      : await this.prisma.storefrontContact.create({ data });

    const previousValues = current
      ? {
          nationalPhone: current.nationalPhone,
          whatsappPhone: current.whatsappPhone,
          salesPhone: current.salesPhone,
          email: current.email,
          businessHoursShort: current.businessHoursShort,
          businessHoursFull: current.businessHoursFull,
          sellWithUsMessage: current.sellWithUsMessage,
        }
      : DEMO_STOREFRONT_CONTACT;

    await this.audit.log({
      userId: actorId,
      action: 'update-storefront-contact',
      entity: 'StorefrontContact',
      entityId: updated.id,
      oldValues: previousValues,
      newValues: {
        nationalPhone: updated.nationalPhone,
        whatsappPhone: updated.whatsappPhone,
        salesPhone: updated.salesPhone,
        email: updated.email,
        businessHoursShort: updated.businessHoursShort,
        businessHoursFull: updated.businessHoursFull,
        sellWithUsMessage: updated.sellWithUsMessage,
      },
      result: 'SUCCESS',
    });

    return updated;
  }
}