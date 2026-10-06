import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';
import { PublicStorefrontController } from './public-storefront.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StorefrontController, PublicStorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}