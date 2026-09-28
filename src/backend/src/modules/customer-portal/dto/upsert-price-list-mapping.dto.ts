import { PortalAccountType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class UpsertPortalPriceListMappingDto {
  @IsEnum(PortalAccountType)
  type!: PortalAccountType;

  @IsUUID()
  priceListId!: string;
}
