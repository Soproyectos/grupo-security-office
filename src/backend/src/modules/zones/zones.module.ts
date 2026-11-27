import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { GeoModule } from '../../common/geo/geo.module';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [PrismaModule, AuditModule, GeoModule],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
