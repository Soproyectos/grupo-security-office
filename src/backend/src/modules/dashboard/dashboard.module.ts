import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';

@Module({
  imports: [PrismaModule, AclModule, HierarchyModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
