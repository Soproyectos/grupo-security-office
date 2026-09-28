import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { PortalAuthGuard } from './portal-auth.guard';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, PortalAuthGuard],
})
export class CustomerPortalModule {}
