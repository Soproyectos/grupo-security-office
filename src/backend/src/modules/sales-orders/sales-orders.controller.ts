import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('sales-orders')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  findAll(
    @Query('quoteId') quoteId?: string,
    @Query('customerId') customerId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
  ) {
    return this.salesOrdersService.findAll({
      quoteId,
      customerId,
      ownerId,
      skip: Number(skip),
      take: Number(take),
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Patch(':id/invoice')
  updateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateInvoiceDto: { externalInvoiceNumber?: string; externalInvoiceDate?: string | null },
  ) {
    // Convert empty string to null for date
    const data = {
      externalInvoiceNumber: updateInvoiceDto.externalInvoiceNumber ?? null,
      externalInvoiceDate:
        updateInvoiceDto.externalInvoiceDate === '' ||
        updateInvoiceDto.externalInvoiceDate == null
          ? null
          : new Date(updateInvoiceDto.externalInvoiceDate),
    };
    return this.salesOrdersService.updateInvoice(id, data);
  }
}