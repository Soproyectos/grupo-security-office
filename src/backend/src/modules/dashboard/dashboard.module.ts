import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardInsightsService } from './dashboard-insights.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';

@Module({
  imports: [PrismaModule, AclModule, HierarchyModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardInsightsService],
  exports: [DashboardService, DashboardInsightsService],
})
export class DashboardModule {}
