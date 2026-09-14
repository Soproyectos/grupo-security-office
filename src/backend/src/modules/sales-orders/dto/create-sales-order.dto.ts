import { IsString, IsDate, IsDecimal, IsOptional, IsIn } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSalesOrderDto {
  @ApiProperty({ example: 'INV-2026-001' })
  @IsString()
  externalInvoiceNumber: string;

  @ApiProperty({ example: '2026-09-14T10:30:00.000Z' })
  @IsDate()
  @Type(() => Date)
  orderDate: Date;

  @ApiProperty({ example: 1500000 })
  @IsDecimal()
  totalAmount: number;

  @ApiPropertyOptional({ example: 'PENDING', description: 'Estado del pedido' })
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'CANCELLED'], { message: 'Estado debe ser PENDING, PAID o CANCELLED' })
  status?: string;
}