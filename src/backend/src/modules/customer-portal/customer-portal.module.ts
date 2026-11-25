import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { PortalAuthModule } from './portal-auth/portal-auth.module';
import { PortalAuthGuard } from './portal-auth.guard';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, StorefrontModule, PortalAuthModule],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, PortalAuthGuard],
})
export class CustomerPortalModule {}
