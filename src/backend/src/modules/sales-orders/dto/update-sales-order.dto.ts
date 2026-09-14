import { IsString, IsDate, IsDecimal, IsOptional, IsIn } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateSalesOrderDto {
  @ApiPropertyOptional({ example: 'INV-2026-002' })
  @IsOptional()
  @IsString()
  externalInvoiceNumber?: string;

  @ApiPropertyOptional({ example: '2026-09-14T11:30:00.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  orderDate?: Date;

  @ApiPropertyOptional({ example: 2000000 })
  @IsOptional()
  @IsDecimal()
  totalAmount?: number;

  @ApiPropertyOptional({ example: 'PAID', description: 'Estado del pedido' })
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'CANCELLED'], { message: 'Estado debe ser PENDING, PAID o CANCELLED' })
  status?: string;
}