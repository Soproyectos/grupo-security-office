import { Module } from '@nestjs/common';
import { ListaActionGuard } from './lista-action.guard';
import { ListasService } from './listas.service';
import { ListasController } from './listas.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclModule } from '../../common/acl/acl.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  controllers: [ListasController],
  imports: [PrismaModule, AclModule, AuditModule],
  providers: [ListasService, ListaActionGuard],
  exports: [ListasService],
})
export class ListasModule {}
