import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';

@Module({
  imports: [PrismaModule, BibliotecaPrismaModule, AclModule, AuditModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
