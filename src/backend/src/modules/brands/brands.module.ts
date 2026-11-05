import { Module } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { BrandsController } from './brands.controller';
import { BibliotecaPrismaModule } from '../../prisma/biblioteca-prisma.module';
import { LibraryAuditModule } from '../library-audit/library-audit.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [BibliotecaPrismaModule, LibraryAuditModule, FilesModule],
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
