import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesOrder } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    quoteId?: string;
    customerId?: string;
    ownerId?: string;
  }) {
    const { skip = 0, take = 50, quoteId, customerId, ownerId } = params;
    const where: Prisma.SalesOrderWhereInput = {};
    if (quoteId) where.quoteId = quoteId;
    if (customerId) where.customerId = customerId;
    if (ownerId) where.ownerId = ownerId;

    const [data, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          quote: { select: { id: true, code: true, status: true } },
          customer: { select: { id: true, code: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data,
      meta: { total, skip, take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  async findOne(id: string) {
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        quote: { select: { id: true, code: true, status: true } },
        customer: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    if (!salesOrder) throw new NotFoundException('SalesOrder not found');
    return salesOrder;
  }

  async updateInvoice(
    id: string,
    data: { externalInvoiceNumber?: string; externalInvoiceDate?: Date | null },
  ) {
    // Ensure the sales order exists
    await this.findOne(id);
    return this.prisma.salesOrder.update({
      where: { id },
      data,
    });
  }
}