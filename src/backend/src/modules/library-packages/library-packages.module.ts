import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { LibraryPackagesService } from './library-packages.service';
import { LibraryPackagesController } from './library-packages.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [LibraryPackagesService],
  controllers: [LibraryPackagesController],
  exports: [LibraryPackagesService],
})
export class LibraryPackagesModule {}
