import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { StorefrontModule } from '../../storefront/storefront.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PortalAuthService } from './portal-auth.service';
import { PortalAdvisorAssignmentService } from './portal-advisor-assignment.service';

@Module({
  imports: [PrismaModule, StorefrontModule, NotificationsModule],
  providers: [PortalAuthService, PortalAdvisorAssignmentService],
  exports: [PortalAuthService, PortalAdvisorAssignmentService],
})
export class PortalAuthModule {}
