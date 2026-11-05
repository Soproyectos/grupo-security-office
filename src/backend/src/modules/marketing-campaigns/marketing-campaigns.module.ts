import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MarketingCampaignsController } from './marketing-campaigns.controller';
import { MarketingCampaignsPublicController } from './marketing-campaigns-public.controller';
import { MarketingCampaignsService } from './marketing-campaigns.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MarketingCampaignsController, MarketingCampaignsPublicController],
  providers: [MarketingCampaignsService],
})
export class MarketingCampaignsModule {}
