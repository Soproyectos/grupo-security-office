import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
@Module({imports:[PrismaModule,HierarchyModule],controllers:[WorkflowController],providers:[WorkflowService]})
export class WorkflowModule {}
