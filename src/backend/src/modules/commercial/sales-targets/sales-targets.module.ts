import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AclModule } from '../../../common/acl/acl.module';
import { HierarchyModule } from '../../../common/hierarchy/hierarchy.module';
import { SalesTargetsService } from './sales-targets.service';
import { SalesTargetsController } from './sales-targets.controller';

@Module({
  imports: [PrismaModule, AclModule, HierarchyModule],
  controllers: [SalesTargetsController],
  providers: [SalesTargetsService],
  exports: [SalesTargetsService],
})
export class SalesTargetsModule {}
