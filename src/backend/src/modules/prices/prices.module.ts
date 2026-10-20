import { Module } from '@nestjs/common';
import { PricesService } from './prices.service';
import { PricesController } from './prices.controller';
import { PriceImportController } from './import/price-import.controller';
import { PriceImportService } from './import/price-import.service';
import { PriceImportResolutionController } from './import/price-import-resolution.controller';
import { PriceImportResolutionService } from './import/price-import-resolution.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { PriceActionGuard } from './price-action.guard';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, AclModule, AuditModule, ProductsModule],
  controllers: [PricesController, PriceImportController, PriceImportResolutionController],
  providers: [PricesService, PriceImportService, PriceImportResolutionService, PriceActionGuard],
  exports: [PricesService],
})
export class PricesModule {}
