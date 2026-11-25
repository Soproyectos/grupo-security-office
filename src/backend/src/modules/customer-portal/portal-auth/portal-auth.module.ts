import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { StorefrontModule } from '../../storefront/storefront.module';
import { PortalAuthService } from './portal-auth.service';

@Module({
  imports: [PrismaModule, StorefrontModule],
  providers: [PortalAuthService],
  exports: [PortalAuthService],
})
export class PortalAuthModule {}
