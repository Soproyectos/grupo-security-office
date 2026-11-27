import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { HierarchyModule } from '../../../common/hierarchy/hierarchy.module';
import { AuditModule } from '../../audit/audit.module';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';

@Module({
  imports: [PrismaModule, HierarchyModule, AuditModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
