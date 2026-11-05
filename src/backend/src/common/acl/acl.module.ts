import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AclService } from './acl.service';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';

@Module({
  imports: [PrismaModule, BibliotecaPrismaModule],
  providers: [AclService],
  exports: [AclService],
})
export class AclModule {}
