import { Module } from '@nestjs/common';
import { PricesService } from './prices.service';
import { PricesController } from './prices.controller';
import { PriceImportController } from './import/price-import.controller';
import { PriceImportService } from './import/price-import.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { PriceActionGuard } from './price-action.guard';

@Module({
  imports: [PrismaModule, AclModule, AuditModule],
  controllers: [PricesController, PriceImportController],
  providers: [PricesService, PriceImportService, PriceActionGuard],
  exports: [PricesService],
})
export class PricesModule {}
