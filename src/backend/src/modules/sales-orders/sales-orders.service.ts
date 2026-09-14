import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { AccessContext } from '../../common/acl/acl.service';

@Injectable()
export class SalesOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSalesOrderDto) {
    // Check if externalInvoiceNumber already exists
    const existing = await this.prisma.salesOrder.findUnique({
      where: { externalInvoiceNumber: dto.externalInvoiceNumber },
    });
    if (existing) {
      throw new Error(`Sales order with external invoice number ${dto.externalInvoiceNumber} already exists`);
    }

    return this.prisma.salesOrder.create({
      data: {
        externalInvoiceNumber: dto.externalInvoiceNumber,
        orderDate: dto.orderDate,
        totalAmount: dto.totalAmount,
        status: dto.status ?? 'PENDING',
      },
    });
  }

  async findAll() {
    return this.prisma.salesOrder.findMany({
      orderBy: { orderDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id },
    });
    if (!salesOrder) {
      throw new NotFoundException(`Sales order with ID ${id} not found`);
    }
    return salesOrder;
  }

  async update(id: string, dto: UpdateSalesOrderDto) {
    // Check if exists
    await this.findOne(id);

    // If updating externalInvoiceNumber, check uniqueness
    if (dto.externalInvoiceNumber) {
      const existing = await this.prisma.salesOrder.findFirst({
        where: {
          externalInvoiceNumber: dto.externalInvoiceNumber,
          NOT: { id },
        },
      });
      if (existing) {
        throw new Error(`Sales order with external invoice number ${dto.externalInvoiceNumber} already exists`);
      }
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: {
        externalInvoiceNumber: dto.externalInvoiceNumber,
        orderDate: dto.orderDate,
        totalAmount: dto.totalAmount,
        status: dto.status,
      },
    });
  }

  async remove(id: string) {
    // Check if exists
    await this.findOne(id);
    return this.prisma.salesOrder.delete({
      where: { id },
    });
  }
}